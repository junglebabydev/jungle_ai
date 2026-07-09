/**
 * Concierge eval runner (the parent-facing chat).
 *
 *   npm run eval:concierge                      # every case
 *   npm run eval:concierge -- merchant-location # one category (or a name substring)
 *
 * Standalone Node ops script — NOT part of `npm test` / `tsc`. It calls the REAL
 * public /concierge endpoints (costs OpenRouter tokens server-side) and scores off
 * the HTTP `results` + an advisory LLM judge. See ./README.md + ./engine.mjs.
 *
 * Prereqs: booking_system on :4003 (OPENROUTER_API_KEY + Typesense reachable),
 * and a merchant/location with PUBLISHED indexed products for the venue cases
 * (CONCIERGE_EVAL_MERCHANT_ID / _LOCATION_ID, falling back to AI_EVAL_*).
 */
try { process.loadEnvFile(); } catch { /* no .env — rely on real env / defaults */ }

import scenarios from "./all-scenarios.mjs";
import { runEval } from "./engine.mjs";

const filter = process.argv[2];

let code = 0;
try {
  const r = await runEval(scenarios, filter);
  // Fail the run on any overall miss OR any CRITICAL must-pass failure.
  code = r.passed < r.total || r.criticalFailed?.length ? 1 : 0;
} catch (e) {
  console.error("concierge eval driver error:", e.message);
  code = 1;
}
process.exit(code);
