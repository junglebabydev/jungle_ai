/**
 * AI agent eval runner.
 *
 *   node tests/ai/merchant/eval/run.mjs                  # every case
 *   node tests/ai/merchant/eval/run.mjs safety           # a whole dimension (safety-*)
 *   node tests/ai/merchant/eval/run.mjs safety-security  # one file
 *   node tests/ai/merchant/eval/run.mjs onboarding       # …or a name substring
 *
 * Standalone Node ops script — NOT part of `npm test` / `tsc`. It calls the real
 * /ai/chat (costs OpenRouter tokens) and reads the dev DB via the Prisma client. See
 * ./README.md and ./engine.mjs for prereqs and the scoring model.
 *
 * This runner only RUNS scenarios — it does NOT clean the database. A run's `Eval *`
 * products, package templates, and AI logs are left in place so a failed run stays
 * inspectable. Use `npm run eval:merchant:reset` for cleanup.
 *
 *   IMPORTANT: run `npm run eval:merchant:reset` BEFORE a fresh run for a clean slate. Without
 *   it, prior `Eval *` products are still active and the duplicate-create guard will
 *   block re-creating the same names, skewing the create/lifecycle scenarios.
 */
try { process.loadEnvFile(); } catch { /* no .env — rely on real env / defaults */ }

import scenarios from "./all-scenarios.mjs";
import { runEval, closeDb, snapshotAccount, restoreAccount } from "./engine.mjs";

const filter = process.argv[2];

// The suite drives real turns, so it RENAMES the merchant, flips its GST flag and
// rewrites the location address — and none of that is `Eval *`-named, so the reset
// script cannot undo it. Snapshot both rows first and put them back afterwards,
// including on Ctrl-C or a driver error, or every run leaves the account permanently
// altered. (compare-models.mjs already did this; a plain run did not.)
const snapshot = await snapshotAccount();
let restored = false;
async function restoreOnce() {
  if (restored) return;
  restored = true;
  try {
    await restoreAccount(snapshot);
  } catch (e) {
    console.error("account restore FAILED — merchant/location may be left renamed:", e.message);
  }
}

// Close the DB cleanly even on Ctrl-C so the process doesn't hang on the open client.
process.on("SIGINT", async () => {
  await restoreOnce();
  await closeDb();
  process.exit(130);
});

let code = 0;
try {
  const r = await runEval(scenarios, filter);
  // Fail the run on any overall miss OR any CRITICAL must-pass failure.
  code = r.passed < r.total || r.criticalFailed?.length ? 1 : 0;
} catch (e) {
  console.error("eval driver error:", e.message);
  code = 1;
} finally {
  await restoreOnce();
  await closeDb();
}
process.exit(code);
