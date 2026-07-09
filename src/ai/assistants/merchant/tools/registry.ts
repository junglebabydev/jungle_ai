import { z } from "zod";
import { OpenRouterTool } from "../../../../lib/openrouter";
import { AnyMerchantTool } from "./types";
import {
  listMyProducts,
  getProduct,
  getMerchant,
  getLocation,
  describeProductFields,
} from "./reads";
import {
  upsertProduct,
  publishProduct,
  archiveProduct,
  unpublishProduct,
  unarchiveProduct,
} from "./product";
import { upsertPricing } from "./pricing";
import { upsertSchedule } from "./schedule";
import { upsertCampOption, archiveCampOption } from "./campOption";
import {
  upsertPackageTemplate,
  publishPackageTemplate,
  unpublishPackageTemplate,
  archivePackageTemplate,
} from "./package";
import { updateLocation, updateMerchant } from "./store";

/**
 * Every merchant-config tool, in registration order — the SINGLE source of the
 * tool set (DRY), consumed by the agent loop and (later) the eval harness, so
 * both see exactly the same tools. Ported 1:1 from the MCP's registry.
 */
export const ALL_TOOLS = [
  // reads (public)
  listMyProducts,
  getProduct,
  getMerchant,
  getLocation,
  describeProductFields,
  // writes (drafts)
  upsertProduct,
  upsertPricing,
  upsertSchedule,
  upsertCampOption,
  upsertPackageTemplate,
  updateLocation,
  updateMerchant,
  // destructive (archive — confirm first)
  archiveProduct,
  archiveCampOption,
  archivePackageTemplate,
  // approve (publish — confirm first)
  publishProduct,
  publishPackageTemplate,
  // reverse visibility transitions (confirm first)
  unpublishProduct,
  unarchiveProduct,
  unpublishPackageTemplate,
] as unknown as AnyMerchantTool[];

/** Lookup by tool name (dispatch). */
export const TOOLS_BY_NAME: Map<string, AnyMerchantTool> = new Map(
  ALL_TOOLS.map((tool) => [tool.name, tool]),
);

/**
 * The OpenAI/OpenRouter `tools` array, built ONCE at module load (static — the
 * shapes never change at runtime, so we don't rebuild per request).
 */
export const MERCHANT_TOOLS: OpenRouterTool[] = ALL_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(z.object(tool.input)),
  },
}));
