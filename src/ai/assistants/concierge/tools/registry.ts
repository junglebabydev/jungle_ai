import { OpenRouterTool } from "../../../../lib/openrouter";
import { ConciergeTool } from "./types";
import { searchActivitiesTool } from "./search";
import { getActivityDetailsTool } from "./activityDetails";

/**
 * The single registry of concierge tools. To add a tool: create its file under
 * `tools/`, then list it here. `scopedOnly` tools are offered only in the
 * merchant-location (per-venue) chat. There is deliberately no dispatch/RBAC/gate
 * layer (cf. the merchant registry) — concierge tools are read-only and public.
 */
const ALL_CONCIERGE_TOOLS: ConciergeTool[] = [
  searchActivitiesTool,
  getActivityDetailsTool,
];

/** Name → tool, for the loop to dispatch a model tool-call. */
export const CONCIERGE_TOOLS_BY_NAME: Record<string, ConciergeTool> =
  Object.fromEntries(ALL_CONCIERGE_TOOLS.map((tool) => [tool.name, tool]));

/**
 * The OpenRouter tool definitions to offer this turn: the per-venue chat adds the
 * `scopedOnly` tools (e.g. `get_activity_details`); global discovery gets only the
 * always-on ones (`search_activities`).
 */
export function conciergeToolsFor(scoped: boolean): OpenRouterTool[] {
  return ALL_CONCIERGE_TOOLS.filter(
    (tool) => scoped || !tool.scopedOnly,
  ).map((tool) => tool.definition);
}
