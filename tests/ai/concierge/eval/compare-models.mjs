/**
 * Concierge model A/B runner — compares candidate models on the SAME concierge
 * suite so you can pick the best-working AND cheapest one.
 *
 * For each candidate it boots a throwaway booking_system on a temp port with a
 * SINGLE-model `CONCIERGE_MODELS=<model>` (single, so a weak model can't silently
 * fall through to the next in the chain and mask its own failures) and rate
 * limiting disabled, runs the suite against it, tears it down, then prints a
 * side-by-side table: DETERMINISTIC pass rate (unbiased, code-checked invariants —
 * the primary signal), the full pass rate (also gated on judged prose), latency,
 * and a rough real-$ cost. The concierge is public + READ-ONLY, so — unlike the
 * merchant A/B — there is no account snapshot/restore to do.
 *
 *   node tests/ai/concierge/eval/compare-models.mjs                       # default candidates, full suite
 *   node tests/ai/concierge/eval/compare-models.mjs discovery-search,shared-quality   # a cheap subset (smoke)
 *   AB_MODELS="deepseek/deepseek-v4-flash,google/gemini-2.5-flash" \
 *     node tests/ai/concierge/eval/compare-models.mjs
 *
 * Cost/verdict notes:
 *  - "cheapest" is nearly settled by the models' published per-token pricing; the
 *    measured $ (OpenRouter credits-delta over each model's window, MINUS the
 *    judge's own spend) is a rough sanity check — the /credits aggregate is
 *    eventually-consistent, so treat the cents as approximate.
 *  - The judge is forced to a NEUTRAL arbiter (JUDGE_MODEL, default openai/gpt-4o-mini)
 *    so no candidate judges its own prose. Trust the DETERMINISTIC column first; the
 *    judged column is confirmation. Judge skips are printed — if they differ a lot
 *    across candidates, discount the judged scores.
 *
 * Prereqs: a complete .env so the child server boots (DATABASE_URL, TYPESENSE_*,
 * OPENROUTER_API_KEY), Typesense reachable + indexed, and a venue with PUBLISHED
 * indexed products for the venue scenarios — pin it via CONCIERGE_EVAL_MERCHANT_ID
 * / _LOCATION_ID (or CONCIERGE_EVAL_VENUES) BEFORE launch. Expensive: tokens × models.
 */
try { process.loadEnvFile(); } catch { /* rely on real env */ }

// Force a NEUTRAL judge so a candidate never grades its own output (self-preference
// bias). Set before importing the harness / running, since judge() reads it per call.
process.env.JUDGE_MODEL = process.env.JUDGE_MODEL || "openai/gpt-4o-mini";

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import scenarios from "./all-scenarios.mjs";
import { runEval, cfg } from "./engine.mjs";

// repo root — this file lives at tests/ai/concierge/eval/, so four levels up.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

// Filter accepts a comma-separated list of category (`group`) / name SUBSTRINGS.
const filterArg = process.argv[2];
const filters = filterArg
  ? filterArg.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  : null;
const subset = filters
  ? scenarios.filter((s) =>
      filters.some(
        (f) =>
          s.group.toLowerCase().includes(f) || s.name.toLowerCase().includes(f),
      ),
    )
  : scenarios;

const MODELS = (process.env.AB_MODELS ||
  "deepseek/deepseek-v4-flash,google/gemini-2.5-flash,google/gemini-3.1-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);

const OR_BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OR_KEY = process.env.OPENROUTER_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const children = [];
function killAll() { for (const c of children) { try { c.kill("SIGKILL"); } catch {} } }
process.on("exit", killAll);
process.on("SIGINT", () => { killAll(); process.exit(1); });

/** Readiness: the server is up once ANY HTTP response comes back from a mounted
 *  route. `/ai/tools` is auth-gated → 401 when up (no model call, so it's free). */
async function waitReady(port, ms = 90000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/api/v1/ai/tools`);
      if (r.status > 0) return true; // 401/200 — the router answered
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  return false;
}

/** A model can 404 under the account's provider allowlist even though it exists.
 *  Skip (and label) those instead of booting a server that scores 0. */
async function modelAvailable(model) {
  if (!OR_KEY) return true;
  try {
    const r = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${OR_KEY}` },
      // max_tokens must be generous: some models (e.g. openai reasoning nanos) 400 on
      // a tiny budget, which would false-negative them as "unavailable".
      body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 64 }),
    });
    return r.status === 200;
  } catch { return false; }
}

/** OpenRouter lifetime usage ($). Eventually-consistent — bracket with a settle. */
async function totalUsage() {
  if (!OR_KEY) return null;
  try {
    const r = await fetch(`${OR_BASE}/credits`, { headers: { authorization: `Bearer ${OR_KEY}` } });
    const j = await r.json();
    return Number(j?.data?.total_usage);
  } catch { return null; }
}

async function runModel(model, port) {
  if (!(await modelAvailable(model))) {
    console.log(`\n=== ${model} — SKIPPED (not available under the account's provider allowlist) ===`);
    return { model, blocked: true };
  }
  const logPath = join(tmpdir(), `ab-concierge-${port}.log`);
  const logFd = openSync(logPath, "w");
  // Spawn the node binary directly with ts-node's loader (NOT `npx ts-node`): on
  // Windows npx resolves to npx.cmd, which spawn() can't exec (EINVAL) without a
  // shell — and a shell wrapper leaves the real node process orphaned on kill.
  // `process.execPath -r ts-node/register` gives a real, killable PID everywhere.
  const child = spawn(process.execPath, ["-r", "ts-node/register", "src/index.ts"], {
    cwd: ROOT,
    // Single-model chain (no fallback masking) + limiters off (the concierge's own
    // per-IP CONCIERGE_RATE_MAX default is 30/min — the eval drives far more from one
    // IP under concurrency, so it must be raised or every burst 429s). Everything else
    // (DB, Typesense, key) is inherited from the parent env.
    env: {
      ...process.env,
      PORT: String(port),
      CONCIERGE_MODELS: model,
      AI_RATE_MAX: "1000000",
      CONCIERGE_RATE_MAX: "1000000",
    },
    stdio: ["ignore", logFd, logFd],
  });
  children.push(child);
  try {
    console.log(`\n=== ${model}  (booting on :${port}) ===`);
    if (!(await waitReady(port))) throw new Error(`server did not become ready (see ${logPath})`);
    cfg.base = `http://localhost:${port}/api/v1`;

    // Bracket the run with a settled credits reading to isolate this model's spend.
    await sleep(3000);
    const usageBefore = await totalUsage();
    const result = await runEval(subset, undefined);
    await sleep(20000); // let the /credits aggregate catch up before reading
    const usageAfter = await totalUsage();

    const windowDelta =
      usageBefore != null && usageAfter != null ? usageAfter - usageBefore : null;
    // The judge runs on the (constant) neutral arbiter — subtract its billed spend
    // so `modelCost` is the CANDIDATE model's own concierge spend.
    const modelCost =
      windowDelta != null ? Math.max(0, windowDelta - result.judge.costUsd) : null;

    return { model, logPath, windowDelta, modelCost, ...result };
  } catch (e) {
    console.log(`  (see ${logPath})`);
    return { model, error: e.message };
  } finally {
    child.kill("SIGTERM");
    await sleep(1500);
    try { child.kill("SIGKILL"); } catch {}
  }
}

function pad(s, n) { return String(s).padEnd(n); }
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

async function main() {
  console.log(
    `Concierge model A/B — ${MODELS.length} model(s) × ${subset.length} scenario(s)` +
    `${filterArg ? ` [${filterArg}]` : " (full suite)"}\n` +
    `Venue scope: ${cfg.venues.map((v) => `${v.merchantId}/${v.locationId}`).join(", ")}  |  Judge: ${process.env.JUDGE_MODEL}`,
  );

  const results = [];
  for (let i = 0; i < MODELS.length; i++) results.push(await runModel(MODELS[i], 4090 + i));

  // --- comparison table --------------------------------------------------------
  console.log("\n" + "═".repeat(92));
  console.log("CONCIERGE MODEL A/B RESULTS");
  console.log("═".repeat(92));
  console.log(
    pad("Model", 34) + pad("Deterministic", 15) + pad("Full", 13) +
    pad("Latency*", 10) + pad("Cost", 11) + "Judge skips",
  );
  console.log("─".repeat(92));
  for (const r of results) {
    if (r.blocked) { console.log(pad(r.model, 34) + "BLOCKED (provider allowlist)"); continue; }
    if (r.error) { console.log(pad(r.model, 34) + `ERROR: ${r.error}`); continue; }
    const det = `${r.detPassed}/${r.total} (${pct(r.detPassed, r.total)}%)`;
    const full = `${r.passed}/${r.total} (${pct(r.passed, r.total)}%)`;
    const lat = `${(r.latencyMs / 1000 / (r.total || 1)).toFixed(1)}s/sc`;
    const cost = r.modelCost != null ? `$${r.modelCost.toFixed(4)}` : "n/a";
    console.log(
      pad(r.model, 34) + pad(det, 15) + pad(full, 13) +
      pad(lat, 10) + pad(cost, 11) + `${r.judge.skips}/${r.judge.calls + r.judge.skips}`,
    );
  }

  // per-category DETERMINISTIC pass rate (the trustworthy per-dimension signal)
  const ok = results.filter((r) => !r.error && !r.blocked);
  const cats = [...new Set(ok.flatMap((r) => Object.keys(r.byCategory || {})))].sort();
  if (cats.length && ok.length) {
    console.log("\nPer-category DETERMINISTIC pass rate:");
    console.log(pad("  category", 26) + ok.map((r) => pad(r.model.split("/").pop().slice(0, 16), 18)).join(""));
    for (const c of cats) {
      console.log(pad("  " + c, 26) + ok.map((r) => {
        const v = r.byCategory[c];
        return pad(v ? `${v.detPassed}/${v.total}` : "—", 18);
      }).join(""));
    }
  }
  console.log("═".repeat(92));
  console.log(
    "* Latency is per-scenario wall time measured UNDER CONCURRENCY — inflated by " +
    "server/provider contention; use for relative comparison only. Cost is unaffected.",
  );

  // Winner: DETERMINISTIC pass rate first (unbiased), ties broken by lower cost.
  const ranked = ok.filter((r) => r.total);
  if (ranked.length > 1) {
    ranked.sort(
      (a, b) =>
        b.detPassed / b.total - a.detPassed / a.total ||
        (a.modelCost ?? Infinity) - (b.modelCost ?? Infinity),
    );
    const w = ranked[0];
    console.log(
      `\nBest deterministic: ${w.model} — ${w.detPassed}/${w.total} (${pct(w.detPassed, w.total)}%)` +
      `${w.modelCost != null ? `, ~$${w.modelCost.toFixed(4)}` : ""}\n`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("concierge ab driver error:", e.message); killAll(); process.exit(1); });
