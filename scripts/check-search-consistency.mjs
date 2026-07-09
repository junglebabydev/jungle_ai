/**
 * Search-index consistency guard (static).
 *
 * The concierge reads a denormalized Typesense index, not the DB. Every service
 * that writes a search-fed entity MUST fire a reindex after the write, or the
 * concierge shows stale data for up to 24h (the reconcile interval). This is
 * exactly how the pricing + package gaps happened.
 *
 * This guard fails if a service that writes a search-fed entity never references
 * `reindex` — a cheap CI backstop for a human forgetting the hook. It does NOT
 * prove the hook is on the right method (that's what the rule review + the live
 * consistency test cover); it catches the "forgot it entirely" case.
 *
 * See .claude/rules/11-prisma-and-data.md → "Search-index consistency".
 * When you add a new searchable entity, add its service here.
 */
import fs from "node:fs";
import path from "node:path";

// service dir -> why it must reindex (the denormalized field/collection it feeds)
const SEARCH_FED = {
  product: "the product doc itself",
  pricing: "product.priceFrom",
  schedule: "product day/time-of-day facets",
  class: "product.classDetails",
  "camp-details": "camp doc",
  "camp-option": "camp availability cutoff",
  "drop-in-schedule": "product drop-in facets",
  "drop-in-details": "product drop-in doc",
  location: "fans out to every product at the location",
  merchant: "the merchants collection",
  "product-category": "product.categoryName / merchant categories",
  "package-template": "the packages collection",
};

const SRC = path.resolve("src/services");
const missing = [];
const skipped = [];

for (const [dir, why] of Object.entries(SEARCH_FED)) {
  const d = path.join(SRC, dir);
  if (!fs.existsSync(d)) {
    // Service may legitimately not exist in this repo (e.g. jungle_ai keeps only
    // the services its assistants touch). Nothing to check.
    skipped.push(dir);
    continue;
  }
  const hasReindex = fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".ts"))
    .some((f) => /reindex/i.test(fs.readFileSync(path.join(d, f), "utf8")));
  if (!hasReindex) missing.push(`${dir} (feeds: ${why})`);
}

if (missing.length) {
  console.error(
    "[search-consistency] services that write a search-fed entity but never call reindex:",
  );
  for (const m of missing) console.error("  - " + m);
  console.error(
    "\nAdd the reindex hook (see .claude/rules/11-prisma-and-data.md). Stale concierge data otherwise.",
  );
  process.exit(1);
}

console.log(
  `[search-consistency] OK — ${
    Object.keys(SEARCH_FED).length - skipped.length
  } search-fed services reindex` +
    (skipped.length ? ` (${skipped.length} not present in this repo)` : "") +
    ".",
);
