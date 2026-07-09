/**
 * Prisma schema drift-guard.
 *
 * jungle_ai, booking_system, and search_engine each keep their OWN copy of
 * `prisma/schema.prisma` (that independence is deliberate — it's what lets each
 * service build and deploy in isolation). The one hazard of that model: all three
 * point at the SAME Postgres, so if booking migrates the DB and this repo's schema
 * copy goes stale, our generated client is silently wrong against the live database.
 *
 * This guard catches that. It compares THIS repo's schema against a canonical one
 * (booking_system's) and exits non-zero on any difference.
 *
 * Isolation contract — this is a standalone OPS check, NOT a build/dev hook:
 *  - Run it from a dedicated CI job (or locally), never `prebuild`/`predev`. Wiring it
 *    into the build would make this repo's build depend on booking being present,
 *    re-coupling the very builds we keep separate.
 *  - If the canonical schema can't be found, it SKIPS (exit 0) with a warning — so an
 *    isolated build where booking isn't checked out never fails on its account. It only
 *    fails when it CAN compare and finds real drift.
 *
 * Canonical source resolution (first hit wins):
 *  1. $CANONICAL_SCHEMA  — an explicit path (CI sets this after fetching booking's schema)
 *  2. ../booking_system/prisma/schema.prisma  — the sibling checkout (local dev default)
 *
 * Usage:  node scripts/check-schema-drift.mjs   (or: npm run check:schema)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OWN_SCHEMA = resolve(__dirname, "../prisma/schema.prisma");

const canonicalPath =
  process.env.CANONICAL_SCHEMA ||
  resolve(__dirname, "../../booking_system/prisma/schema.prisma");

/** Normalize so a pure CRLF/trailing-whitespace difference never trips the guard. */
const normalize = (s) => s.replace(/\r\n/g, "\n").replace(/\s+$/g, "").split("\n");

if (!existsSync(OWN_SCHEMA)) {
  console.error(`[schema-drift] cannot find own schema at ${OWN_SCHEMA}`);
  process.exit(1);
}
if (!existsSync(canonicalPath)) {
  console.warn(
    `[schema-drift] SKIP — canonical schema not found at ${canonicalPath}. ` +
      `Set CANONICAL_SCHEMA to booking_system's prisma/schema.prisma to enable the check.`,
  );
  process.exit(0);
}

const own = normalize(readFileSync(OWN_SCHEMA, "utf8"));
const canonical = normalize(readFileSync(canonicalPath, "utf8"));

if (own.join("\n") === canonical.join("\n")) {
  console.log(`[schema-drift] OK — schema matches ${canonicalPath}`);
  process.exit(0);
}

// Report the first divergence with a little context so the fix is obvious.
const max = Math.max(own.length, canonical.length);
let firstDiff = -1;
for (let i = 0; i < max; i++) {
  if (own[i] !== canonical[i]) {
    firstDiff = i;
    break;
  }
}

console.error(
  `\n[schema-drift] DRIFT DETECTED — this repo's prisma/schema.prisma differs from the canonical.\n` +
    `  canonical : ${canonicalPath} (${canonical.length} lines)\n` +
    `  this repo : ${OWN_SCHEMA} (${own.length} lines)\n` +
    `  first difference at line ${firstDiff + 1}:\n` +
    `    canonical> ${canonical[firstDiff] ?? "(end of file)"}\n` +
    `    thisrepo > ${own[firstDiff] ?? "(end of file)"}\n\n` +
    `  Fix: re-copy booking_system's prisma/schema.prisma here, run \`npx prisma generate\`,\n` +
    `  and commit — the shared DB is the single source of truth.\n`,
);
process.exit(1);
