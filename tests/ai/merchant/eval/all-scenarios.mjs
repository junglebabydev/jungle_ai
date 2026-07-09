/**
 * Collects every scenario module under ./scenarios into one flat list. Each module
 * exports `{ category, scenarios: [...] }`; the category is stamped onto each
 * scenario here so individual scenarios don't repeat it.
 *
 * Files are organized into THREE dimension folders, so the structure reads itself
 * and `npm run eval:merchant -- <dimension>` runs a whole group:
 *
 *   scenarios/capability/    can the agent DO it (tools, builds, schema adherence)
 *   scenarios/conversation/  multi-turn coherence (coreference, refinement, recall)
 *   scenarios/safety/        guardrails, grounding, robustness, adversarial security
 *
 * Every category is "<folder>-<file>" (e.g. capability-product-builds,
 * safety-guardrails), so the runner's substring filter selects a whole dimension
 * (`-- capability`), a theme, or one file. Add a file = add one import below.
 */
// --- capability (can the agent do it) ---
import onboarding from "./scenarios/capability/onboarding.mjs";
import productBuilds from "./scenarios/capability/product-builds.mjs";
import toolCoverage from "./scenarios/capability/tool-coverage.mjs";
// --- conversation (multi-turn coherence) ---
import memory from "./scenarios/conversation/memory.mjs";
// --- safety (guardrails / grounding / robustness / security) ---
import guardrails from "./scenarios/safety/guardrails.mjs";
import grounding from "./scenarios/safety/grounding.mjs";
import robustness from "./scenarios/safety/robustness.mjs";
import security from "./scenarios/safety/security.mjs";

const modules = [
  // capability
  onboarding,
  productBuilds,
  toolCoverage,
  // conversation
  memory,
  // safety
  guardrails,
  grounding,
  robustness,
  security,
];

// `critical` marks must-pass invariants (no wrong/unauthorized action, no cross-tenant
// leak, injection resistance, no fabrication): a scenario sets its own `critical`, or a
// whole file marks every scenario via `critical: true` at the module level. The harness
// gates a run on these.
const scenarios = modules.flatMap((m) =>
  m.scenarios.map((s) => ({ ...s, category: m.category, critical: s.critical ?? m.critical ?? false })),
);

export default scenarios;
