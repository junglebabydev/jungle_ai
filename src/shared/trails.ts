import {
  ACTIVITY_CATEGORY_TRAIL_MAP,
  ACTIVITY_CATEGORY_QUERY_TERMS,
  EXPLORER_MAP_TRAIL_INTENT_TERMS,
  EXPLORER_MAP_SUBCATEGORY_TRAIL_MAP,
  TRAILS,
} from "./constants";
import type {
  ActivityCategory,
  CategoryTrailDefinition,
  Trail,
} from "./constants";

const categoryEntries: Array<[string, CategoryTrailDefinition]> = [
  ...Object.entries(EXPLORER_MAP_SUBCATEGORY_TRAIL_MAP),
  ...(Object.entries(ACTIVITY_CATEGORY_TRAIL_MAP) as Array<
    [ActivityCategory, CategoryTrailDefinition]
  >),
];

export function getExplorerMapTrailForCategory(
  rawCategory: string | null | undefined,
): CategoryTrailDefinition | undefined {
  const normalized = rawCategory?.trim().toLowerCase();
  if (!normalized) return undefined;
  return categoryEntries.find(
    ([category]) => category.toLowerCase() === normalized,
  )?.[1];
}

export type ExplorerMapTrails = {
  primaryTrails: Trail[];
  alsoBuildsTrails: Trail[];
  trails: Trail[];
};

/** Aggregate one or more canonical category labels into indexable trail facets. */
export function deriveExplorerMapTrails(
  categories: ReadonlyArray<string | null | undefined>,
): ExplorerMapTrails {
  const primary = new Set<Trail>();
  const secondary = new Set<Trail>();

  for (const category of categories) {
    const definition = getExplorerMapTrailForCategory(category);
    if (!definition) continue;
    primary.add(definition.primary);
    for (const trail of definition.alsoBuilds) secondary.add(trail);
  }

  // A trail that is primary for any mapped category should not also be labelled
  // secondary on the same search document.
  for (const trail of primary) secondary.delete(trail);

  const primaryTrails = TRAILS.filter((trail) => primary.has(trail));
  const alsoBuildsTrails = TRAILS.filter((trail) => secondary.has(trail));
  return {
    primaryTrails,
    alsoBuildsTrails,
    trails: TRAILS.filter((trail) => primary.has(trail) || secondary.has(trail)),
  };
}

/** Ground model/client trail values to the canonical vocabulary, OR semantics. */
export function normalizeExplorerMapTrails(
  input: string | string[] | undefined,
): Trail[] {
  const values = input == null ? [] : Array.isArray(input) ? input : [input];
  const grounded = new Set<Trail>();
  for (const raw of values) {
    const normalized = raw.trim().toLowerCase();
    const match = TRAILS.find((trail) => trail.toLowerCase() === normalized);
    if (match) grounded.add(match);
  }
  return TRAILS.filter((trail) => grounded.has(trail));
}

/**
 * Infer only explicit Explorer Map language from the parent's current message.
 * Padded phrase matching avoids partial-word accidents.
 */
export function inferExplorerMapTrailsFromText(text: string): Trail[] {
  const normalized = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

  return TRAILS.filter((trail) =>
    EXPLORER_MAP_TRAIL_INTENT_TERMS[trail].some((term) =>
      normalized.includes(` ${term} `),
    ),
  );
}

/** Infer canonical activity chips from explicit activity words in a query. */
export function inferActivityCategoriesFromText(
  text: string,
): ActivityCategory[] {
  const normalized = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

  return (Object.entries(ACTIVITY_CATEGORY_QUERY_TERMS) as Array<
    [ActivityCategory, readonly string[]]
  >)
    .filter(([, terms]) =>
      terms.some((term) => normalized.includes(` ${term} `)),
    )
    .map(([category]) => category);
}

const GENERIC_TRAIL_QUERY_WORDS = new Set([
  "activity",
  "activities",
  "active",
  "body",
  "cognitive",
  "creative",
  "creativity",
  "curiosity",
  "discovery",
  "expression",
  "movement",
  "options",
  "physical",
  "social",
  "something",
  "stuff",
  "teamwork",
  "things",
]);

/** True when the model's query contains only developmental/filler language. */
export function isGenericExplorerMapQuery(query: string): boolean {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every((word) => GENERIC_TRAIL_QUERY_WORDS.has(word));
}

/** Pick neutral new ground: the first canonical trail not already represented. */
export function chooseComplementaryExplorerMapTrail(
  representedTrails: readonly Trail[],
): Trail | undefined {
  return TRAILS.find((trail) => !representedTrails.includes(trail));
}
