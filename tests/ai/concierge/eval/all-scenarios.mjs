/**
 * Collects every concierge eval scenario module into one flat list. Each module
 * exports `{ category, scenarios: [...] }`; the category is stamped onto each
 * scenario here as `group`. Add a scenario file = add one import + one array entry.
 *
 * Files are organized into THREE folders, one per surface — so the structure reads
 * itself and `npm run eval:concierge -- <surface>` runs a whole group:
 *
 *   scenarios/discovery/  → the global product-search chat  (/concierge/chat)
 *   scenarios/venue/      → the per-venue chat              (/concierge/merchant-location/chat)
 *   scenarios/shared/     → cross-cutting (grounding, security, robustness, bookings)
 *
 * Every category is prefixed by its surface ("discovery-*", "venue-*") except the
 * shared ones, so the runner's prefix filter (`-- discovery` / `-- venue`) selects
 * a whole surface. See README.md for the scoring tables.
 */
// --- discovery (global product-search) ---
import discoverySearch from "./scenarios/discovery/search.mjs";
import discoveryProducts from "./scenarios/discovery/products.mjs";
import discoveryCamps from "./scenarios/discovery/camps.mjs";
import discoveryPricing from "./scenarios/discovery/pricing.mjs";
import discoveryRegions from "./scenarios/discovery/regions.mjs";
import discoveryProviders from "./scenarios/discovery/providers.mjs";
import discoveryFilters from "./scenarios/discovery/filters.mjs";
import discoveryConversation from "./scenarios/discovery/conversation.mjs";
import discoveryExplorerMap from "./scenarios/discovery/explorer-map.mjs";
import discoveryPackages from "./scenarios/discovery/packages.mjs";
// --- venue (per merchant-location) ---
import venueKnowledge from "./scenarios/venue/knowledge.mjs";
import venueLocation from "./scenarios/venue/location.mjs";
import venueActivityDetails from "./scenarios/venue/activity-details.mjs";
import venuePricing from "./scenarios/venue/pricing.mjs";
import venueCamps from "./scenarios/venue/camps.mjs";
import venueConversation from "./scenarios/venue/conversation.mjs";
// --- shared (cross-cutting) ---
import grounding from "./scenarios/shared/grounding.mjs";
import security from "./scenarios/shared/security.mjs";
import jailbreak from "./scenarios/shared/jailbreak.mjs";
import childSafety from "./scenarios/shared/child-safety.mjs";
import robustness from "./scenarios/shared/robustness.mjs";
import quality from "./scenarios/shared/quality.mjs";
import bookings from "./scenarios/shared/bookings.mjs";

const modules = [
  // discovery
  discoverySearch,
  discoveryProducts,
  discoveryCamps,
  discoveryPricing,
  discoveryRegions,
  discoveryProviders,
  discoveryFilters,
  discoveryConversation,
  discoveryExplorerMap,
  discoveryPackages,
  // venue
  venueKnowledge,
  venueLocation,
  venueActivityDetails,
  venuePricing,
  venueCamps,
  venueConversation,
  // shared
  grounding,
  security,
  jailbreak,
  childSafety,
  robustness,
  quality,
  bookings,
];

// Stamp the module's taxonomy onto `group` — NOT `category`, because a scenario's
// own `category`/`region` are the API FILTER CHIPS the harness sends to the search.
//
// `critical` marks must-pass invariants (no fabrication, no cross-scope leak, safety):
// a scenario sets its own `critical`, or a whole file marks every scenario by exporting
// `critical: true` at the module level. The harness gates a run on these.
const scenarios = modules.flatMap((m) =>
  m.scenarios.map((s) => ({ ...s, group: m.category, critical: s.critical ?? m.critical ?? false })),
);

export default scenarios;
