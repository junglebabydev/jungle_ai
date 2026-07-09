/**
 * Hard-reset the LOCAL eval sandbox.
 *
 *   npm run eval:merchant:reset
 *
 * Permanently deletes every `Eval *` product (and its config children: details,
 * pricing, schedules, sessions, camp options), every `Eval *` package template, and
 * all AI conversation logs for the sandbox merchant — undoing the accumulation that
 * builds up across runs. The normal `npm run eval:merchant` no longer cleans up after itself
 * (so a failed run's artifacts stay inspectable); run THIS when you want a clean DB,
 * e.g. right before a fresh run.
 *
 * LOCAL ONLY: refuses to run unless DATABASE_URL points at localhost. Scoped to the
 * configured sandbox merchant (AI_EVAL_MERCHANT_ID / AI_EVAL_LOCATION_ID).
 */
try { process.loadEnvFile(); } catch { /* rely on real env */ }

import { cfg, resetEvalData, closeDb } from "./engine.mjs";

const masked = cfg.dbUrl.replace(/\/\/[^@]*@/, "//***@");
console.log(`Resetting eval sandbox → merchant ${cfg.merchantId}/loc ${cfg.locationId} on ${masked}`);

try {
  const r = await resetEvalData();
  const touched = r.product + r.packageTemplate + r.conversations;
  console.log(
    `✓ Cleared ${r.product} product(s) + children ` +
      `(pricing ${r.pricing}, schedules ${r.schedule}, sessions ${r.session}, camp options ${r.campOption}), ` +
      `${r.packageTemplate} package template(s), ${r.conversations} AI conversation log(s).`,
  );
  if (!touched) console.log("(nothing to clear — sandbox already clean)");
} catch (e) {
  console.error("eval:merchant:reset failed:", e.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
