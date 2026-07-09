/**
 * Model A/B runner — compares candidate models on the SAME eval suite.
 *
 * For each model it boots a throwaway booking_system instance on a temp port with
 * `AI_MODELS=<model>` (and rate limiting disabled), runs the suite against it,
 * tears it down, then prints a side-by-side pass-rate / cost / latency table —
 * including a per-category breakdown so you can see exactly which dimensions a
 * stronger model lifts (e.g. memory / lifecycle). No production API change and it
 * never touches your already-running dev server.
 *
 *   node tests/ai/merchant/eval/compare-models.mjs                          # default models, full suite
 *   node tests/ai/merchant/eval/compare-models.mjs conversation-memory      # one category (cheap, discriminating)
 *   AB_MODELS="google/gemini-2.5-flash,anthropic/claude-3.7-sonnet,openai/gpt-4o-mini" \
 *     node tests/ai/merchant/eval/compare-models.mjs capability-product-builds,conversation-memory,safety-guardrails
 *
 * Prereqs: same as run.mjs (DB reachable via Prisma + a complete .env so the child server boots),
 * plus OPENROUTER access to each candidate model. Expensive: tokens × models.
 */
try { process.loadEnvFile(); } catch { /* rely on real env */ }

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import scenarios from "./all-scenarios.mjs";
import { runEval, cleanupTestData, snapshotAccount, restoreAccount, closeDb, cfg } from "./engine.mjs";

// repo root — this file now lives at tests/ai/merchant/eval/, so four levels up.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
// Filter accepts a comma-separated list of category SUBSTRINGS / name-substrings
// (categories are "<folder>-<file>", so "safety" selects every safety-* category).
const filterArg = process.argv[2];
const filters = filterArg ? filterArg.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
const subset = filters
  ? scenarios.filter((s) => filters.some((f) => s.category.toLowerCase().includes(f) || s.name.toLowerCase().includes(f)))
  : scenarios;
const MODELS = (process.env.AB_MODELS ||
  "google/gemini-2.5-flash,openai/gpt-4o-mini,anthropic/claude-3.7-sonnet")
  .split(",").map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authHeaders = {
  authorization: `Bearer ${cfg.accessToken}`,
  "x-refresh-token": cfg.refreshToken,
};

async function waitReady(port, ms = 45000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/api/v1/ai/tools`, { headers: authHeaders });
      if (r.status === 200) return true;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  return false;
}

const children = [];
// Pristine baseline of the sandbox merchant/location, captured before any model
// run; restored before each model (so they all start equal) and at the end.
let accountSnapshot = null;
function killAll() { for (const c of children) { try { c.kill("SIGKILL"); } catch {} } }
process.on("exit", killAll);
process.on("SIGINT", () => { killAll(); process.exit(1); });

/** Pre-probe: a model can 404 under the account's provider allowlist even though
 *  it exists. Skip (and label) those instead of booting a server that scores 0. */
async function modelAvailable(model) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return true;
  try {
    const r = await fetch(`${process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
    });
    return r.status === 200;
  } catch { return false; }
}

async function runModel(model, port) {
  if (!(await modelAvailable(model))) {
    console.log(`\n=== ${model} — SKIPPED (not available under the account's provider allowlist) ===`);
    return { model, blocked: true, passed: 0, total: 0, byCategory: {}, cost: 0, tokens: 0, latencyMs: 0 };
  }
  const logPath = join(tmpdir(), `ab-${port}.log`); // os.tmpdir() — portable; "/tmp" doesn't exist on Windows
  const logFd = openSync(logPath, "w");
  // npx resolves to npx.cmd on Windows, which spawn() can't exec without the suffix.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(npx, ["ts-node", "src/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), AI_MODELS: model, AI_RATE_MAX: "1000000" },
    stdio: ["ignore", logFd, logFd],
  });
  children.push(child);
  try {
    console.log(`\n=== ${model}  (booting on :${port}) ===`);
    if (!(await waitReady(port))) throw new Error(`server did not become ready (see ${logPath})`);
    cfg.base = `http://localhost:${port}/api/v1`;
    await restoreAccount(accountSnapshot); // every model starts from the same baseline
    await cleanupTestData();
    const result = await runEval(subset, undefined);
    return { model, ...result };
  } catch (e) {
    return { model, error: e.message, passed: 0, total: 0, byCategory: {}, cost: 0, tokens: 0, latencyMs: 0 };
  } finally {
    child.kill("SIGTERM");
    await sleep(1500);
    try { child.kill("SIGKILL"); } catch {}
  }
}

function pad(s, n) { return String(s).padEnd(n); }

async function main() {
  console.log(`Model A/B — ${MODELS.length} model(s) × ${subset.length} scenario(s)${filterArg ? ` [${filterArg}]` : " (full suite)"}`);
  accountSnapshot = await snapshotAccount();
  const results = [];
  for (let i = 0; i < MODELS.length; i++) results.push(await runModel(MODELS[i], 4090 + i));

  // --- comparison table ---
  console.log("\n" + "═".repeat(74));
  console.log("MODEL A/B RESULTS");
  console.log("═".repeat(74));
  console.log(pad("Model", 38) + pad("Pass", 9) + pad("Cost", 11) + pad("Tokens", 10) + "Latency");
  for (const r of results) {
    if (r.blocked) { console.log(pad(r.model, 38) + "BLOCKED (provider allowlist)"); continue; }
    if (r.error) { console.log(pad(r.model, 38) + `ERROR: ${r.error}`); continue; }
    const rate = r.total ? `${r.passed}/${r.total}` : "0/0";
    console.log(
      pad(r.model, 38) + pad(rate, 9) +
      pad(`$${r.cost.toFixed(4)}`, 11) + pad(`${(r.tokens / 1000).toFixed(0)}k`, 10) +
      `${(r.latencyMs / 1000).toFixed(0)}s`,
    );
  }

  // per-category breakdown
  const cats = [...new Set(results.flatMap((r) => Object.keys(r.byCategory)))].sort();
  if (cats.length) {
    console.log("\nPer-category pass rate:");
    console.log(pad("  category", 20) + results.map((r) => pad(r.model.split("/").pop().slice(0, 14), 16)).join(""));
    for (const c of cats) {
      console.log(pad("  " + c, 20) + results.map((r) => {
        const v = r.byCategory[c];
        return pad(v ? `${v.passed}/${v.total}` : "—", 16);
      }).join(""));
    }
  }
  console.log("═".repeat(74) + "\n");

  // Winner hint by pass rate (ties broken by lower cost).
  const ok = results.filter((r) => !r.error && r.total);
  if (ok.length > 1) {
    ok.sort((a, b) => (b.passed / b.total - a.passed / a.total) || (a.cost - b.cost));
    console.log(`Best pass rate: ${ok[0].model} (${ok[0].passed}/${ok[0].total}, $${ok[0].cost.toFixed(4)})\n`);
  }
}

main()
  .then(async () => { await restoreAccount(accountSnapshot); await closeDb(); })
  .catch((e) => { console.error("ab driver error:", e.message); killAll(); process.exit(1); });
