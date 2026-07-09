/**
 * Concierge GOLDEN launch-readiness gate — the curated go/no-go.
 *
 *   npm run eval:concierge:golden            # behavioural gate (launch-readiness)
 *   npm run eval:concierge:golden -- exact   # exact-fact tier (needs a rich catalogue)
 *   npm run eval:concierge:golden -- launch  # behavioural tier explicitly
 *   npm run eval:concierge:golden -- pricing # a name/category substring within the set
 *
 * Layered ON TOP of the breadth suite (`npm run eval:concierge`). It runs a small,
 * curated set through the SAME engine (deterministic invariants + advisory judge),
 * then applies the launch gate. See docs/concierge/golden-launch-readiness-gate.md.
 *
 * Gate outcome / exit code:
 *   ⛔ NOT launch-ready (exit 1)  — any `[CRITICAL]` case failed.
 *   ⚠️ INCONCLUSIVE   (exit 1)   — no OPENROUTER_API_KEY, so the judge SKIPPED
 *                                   (returns pass) and the judge-gated criticals were
 *                                   verified by nothing. Set the key to certify.
 *   ✅ launch-ready   (exit 0)   — all criticals held (judge live). Non-critical
 *                                   misses below the 85% target are reported, not blocked.
 *
 * DEFAULT (no arg) runs the BEHAVIOURAL tier only — the exact-fact tier needs the
 * flagship merchants published + indexed (rich dev/prod), so it's opt-in via `-- exact`
 * or CONCIERGE_GOLDEN_EXACT=1 to keep the local gate clean.
 */
try { process.loadEnvFile(); } catch { /* rely on real env / defaults */ }

import { runEval } from "./engine.mjs";
import launchReadiness from "./scenarios/golden/launch-readiness.mjs";
import exactFacts from "./scenarios/golden/exact-facts.mjs";

const NON_CRITICAL_TARGET = 0.85; // WhatsApp ">= 85% overall" target (non-blocking)
const arg = (process.argv[2] || "").trim();
const argLc = arg.toLowerCase();

// Tier selection. `exact`/`launch` pick a tier; any other arg is a name/category
// filter applied within the default set (+ exact when CONCIERGE_GOLDEN_EXACT=1).
const wantExactEnv = process.env.CONCIERGE_GOLDEN_EXACT === "1";
let modules;
let subFilter;
if (argLc === "exact" || argLc === "facts" || argLc === "fact") {
  modules = [exactFacts];
  subFilter = undefined;
} else if (argLc === "launch" || argLc === "behavioural" || argLc === "behavioral") {
  modules = [launchReadiness];
  subFilter = undefined;
} else {
  modules = wantExactEnv ? [launchReadiness, exactFacts] : [launchReadiness];
  subFilter = arg || undefined; // e.g. "pricing" / "context" / "security"
}

// Stamp taxonomy + criticality. A case is a LAUNCH BLOCKER when its name starts with
// "[CRITICAL] " (the golden convention) OR it opted in via `critical` — never for the
// exact-fact tier, which is the target, not a blocker.
const scenarios = modules.flatMap((m) =>
  m.scenarios.map((s) => ({
    ...s,
    group: m.category,
    critical:
      m.critical === false
        ? false
        : s.name.startsWith("[CRITICAL] ") || s.critical || m.critical || false,
  })),
);

const hasJudge = !!process.env.OPENROUTER_API_KEY;

function banner(line, colorCode) {
  const bar = "═".repeat(72);
  console.log(`\n${bar}\n\x1b[${colorCode}m${line}\x1b[0m\n${bar}`);
}

let code = 0;
try {
  if (scenarios.length === 0) {
    console.log("No golden scenarios selected (fill exact-facts ids, or check the filter).");
    process.exit(1);
  }

  const r = await runEval(scenarios, subFilter);
  const criticalFailed = r.criticalFailed ?? [];
  const rate = r.total ? r.passed / r.total : 0;

  if (!hasJudge) {
    banner(
      "⚠️  GOLDEN GATE: INCONCLUSIVE — no OPENROUTER_API_KEY, so the judge was skipped.\n" +
        "   Judge-gated criticals (pricing/context/boundary/safety/security) were checked by nothing.\n" +
        "   Set OPENROUTER_API_KEY and re-run to certify launch-readiness.",
      33,
    );
    code = 1;
  } else if (criticalFailed.length) {
    banner(
      `⛔ GOLDEN GATE: NOT launch-ready — ${criticalFailed.length} CRITICAL case(s) failed:\n` +
        criticalFailed.map((n) => `     - ${n}`).join("\n"),
      31,
    );
    code = 1;
  } else {
    const pct = Math.round(rate * 100);
    const targetNote =
      rate < NON_CRITICAL_TARGET
        ? `  (below the ${Math.round(NON_CRITICAL_TARGET * 100)}% non-critical target — review the misses, not launch-blocking)`
        : "";
    banner(
      `✅ GOLDEN GATE: launch-ready — all ${r.criticalTotal} CRITICAL invariants held.\n` +
        `   Overall ${r.passed}/${r.total} (${pct}%)${targetNote}`,
      32,
    );
    code = 0;
  }
} catch (e) {
  console.error("golden gate driver error:", e.message);
  code = 1;
}
process.exit(code);
