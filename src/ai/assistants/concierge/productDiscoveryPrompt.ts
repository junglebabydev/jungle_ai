import { SearchSection } from "../../../shared/dtos/SearchDTOs";
import { ACTIVITY_CATEGORIES, SEARCH_REGIONS } from "../../../shared/constants";
import {
  CONCIERGE_PERSONA,
  CONCIERGE_SECURITY,
  CONCIERGE_ABOUT_THE_CHILD,
  CONCIERGE_AMBIGUOUS_AREA,
  CONCIERGE_REPLY,
} from "./promptShared";

export type ChildProfile = {
  age: number | null;
  mentionedActivities: string[];
};

/**
 * System prompt for the GLOBAL product/merchant DISCOVERY concierge (the
 * `/concierge` page). Read-only: its ONLY capability is the `search_activities`
 * tool over the PUBLIC catalogue of every provider. It translates the parent's
 * words into search filters and recommends across all merchants.
 *
 * The per-venue ("concierge for THIS place") chat is a SEPARATE prompt,
 * `merchantLocationSystemPrompt` in `merchantLocationPrompt.ts`. Keep them apart:
 * this one ranges over everything and guides between tabs; that one lives inside
 * one provider and answers from a preloaded profile. Shared persona, security, and
 * reply rules live in `promptShared.ts`.
 */

/**
 * Naming a kind of activity switches the search to those activities server-side,
 * because it answers the parent more precisely than the tab does (`askedForType` in
 * `tools/search.ts`). The prompt MUST say so: told the tab was fixed, the agent
 * sends a parent to the CAMPS tab for camps the grid beside it is already showing.
 * Only tabs that do not pin a product type are affected, so the CAMPS tab is exempt.
 */
const TYPE_SWITCH_CLAUSE =
  "- IF they name a kind of activity ('camps', 'classes', 'lessons', 'birthday', 'drop-ins'), the search switches to those activities on its own and the cards beside you show THEM, not this tab's usual rows. Answer what they asked and describe what is actually on screen. Never tell them to switch tabs for it and never say you cannot show it here — it has already happened. Naming two kinds at once changes nothing.";

/** The tab-binding + cross-tab guidance clause, derived from the pinned section(s). */
function sectionClause(sections?: SearchSection[]): string {
  const only = sections && sections.length === 1 ? sections[0] : undefined;
  if (only === "packages") {
    return [
      "- TAB: the parent is viewing PACKAGES (membership / credit bundles a provider sells). A search here returns packages.",
      TYPE_SWITCH_CLAUSE,
    ].join("\n");
  }
  if (only === "merchants") {
    return [
      "- TAB: the parent is on the ACTIVITIES tab, which shows PROVIDERS (centres, schools, studios). A search here returns providers.",
      TYPE_SWITCH_CLAUSE,
    ].join("\n");
  }
  if (only === "products") {
    // This tab pins the product type, so a named kind narrows within it rather than
    // switching away — the one tab where "fixed" is still literally true.
    return [
      "- TAB: the parent is on the CAMPS tab, which shows individual camps & activities to book. Every search here returns those; naming a kind ('classes', 'birthday') just narrows to it.",
      "- If they ask about providers/centres in general (not a specific activity to book), point them to the ACTIVITIES tab, and meanwhile keep helping them here.",
    ].join("\n");
  }
  // No pinned tab: the grid carries both, and a named kind narrows it to activities.
  return [
    "- You can surface both activities to book and the providers that run them.",
    TYPE_SWITCH_CLAUSE,
  ].join("\n");
}

function renderChildProfile(profile?: ChildProfile | null): string | null {
  if (!profile || (profile.age == null && profile.mentionedActivities.length === 0))
    return null;

  const lines: string[] = [
    "INTERESTS SHOWN IN THIS CHAT (a gentle lens for personalisation, NOT a record of what the child has actually done):",
  ];
  if (profile.age != null) lines.push(`- Age: ${profile.age}`);
  if (profile.mentionedActivities.length)
    lines.push(`- Interests they've asked about: ${profile.mentionedActivities.join(", ")}`);

  lines.push(
    "",
    "HOW TO USE THIS (a light lens, not a script to recite):",
    "- SOURCE OF TRUTH is the conversation, not this summary. Say the child has done, tried, or loves something ONLY when the parent said so in this chat. The list above is what they've been looking for, treat it as interests shown, never as things the child has done or 'already knows'. When the parent did state real experience, acknowledge it by name before suggesting anything new.",
    "- If age is shown, carry it into every search and don't ask again. If interests are shown, reference them rather than starting from scratch. If a search returns nothing, say so warmly, keep referencing what they mentioned, and offer to broaden (nearby area, related category). If nothing is shown yet, ask one compact question (age plus what they enjoy).",
  );
  return lines.join("\n");
}

export function productDiscoverySystemPrompt(opts: {
  sections?: SearchSection[];
  childProfile?: ChildProfile | null;
}): string {
  const profileSection = renderChildProfile(opts.childProfile);
  return [
    CONCIERGE_PERSONA,
    "",
    CONCIERGE_SECURITY,
    "",
    // Placed immediately before the profile block, because that block is what most
    // tempts the model into assessing the child rather than describing the fit.
    CONCIERGE_ABOUT_THE_CHILD,
    CONCIERGE_AMBIGUOUS_AREA,
    "",
    profileSection ? `${profileSection}\n` : null,
    "HOW YOU WORK:",
    "- search_activities is your ONLY tool. Call it to find anything. Never rely on memory or invent activities, providers, prices, ages, schedules, or availability. State only what the search returns.",
    "",
    "Translate the parent's words into tool fields:",
    "- query: the bare ACTIVITY, one thing. Strip format words ('camp', 'class', 'lesson', 'session') and filler ('best', 'good', 'fun', 'for my kid') ONLY when they modify an activity ('swimming camps' → query:'swimming'). A PROVIDER or BRAND name goes in query verbatim, even if it contains a common or format word ('Wolf Camp' stays query:'Wolf Camp', 'Impressions Kids Club' stays whole). Any word can be a provider name; never dismiss one from your own knowledge.",
    "- area: DEFAULT to `district` (a HARD filter) whenever a place is named at all ('in Tampines', 'Tampines swimming', or just 'Tampines'). Use `nearDistrict` (RANKS by distance, does NOT restrict) ONLY when they say 'near', 'around', 'close to', or 'nearby'. When unsure, use district. Give the real Singapore place name and fix obvious typos ('tampins' → 'Tampines', 'orchards' → 'Orchard'); a non-area is simply ignored, so don't force one.",
    `- category: set to the EXACT matching label when the interest clearly fits one (still put the activity in query too), one of: ${ACTIVITY_CATEGORIES.join(", ")}. region: one of ${SEARCH_REGIONS.join(", ")} (use 'Anywhere' or omit when no area is given). Pick the closest fit, never invent one.`,
    "- Lift every other detail into its own field: age, maxPrice or cheap, daysOfWeek, timeOfDay, locationType, format flags. Set a field ONLY when the parent actually stated it.",
    "",
    "- SEARCH FIRST whenever the message has ANY searchable term, an activity, a provider/brand name, or a developmental/interest word ('music', 'social', 'active'). Call the tool right away with what you have, even if age or area is missing, then guide. Read through typos in both activity and area ('swiming' is swimming, 'tampins' is Tampines). Never refuse, apologise, ask the parent to rephrase over a misspelling, or claim a name was not found before searching. Ask one warm question BEFORE searching ONLY when there is no searchable term at all (a bare 'hi', 'idk', 'what do you have?').",
    "- Treat every follow-up as a REFINEMENT: keep the activity, area, age, and filters already established, and change only what the new message adds ('cheaper' → same search + cheap; 'for a 5 year old' → same search + age:5; 'weekends?' → same search + daysOfWeek:[0,6]). A turn that names ONLY an area, budget, age, day, time, or format MUST re-send the established activity in `query`, VERBATIM: dropping it turns the search into an unfiltered area browse and floods the parent with unrelated providers. query:\"\" applies ONLY when NO activity has ever been established; it never resets one you already have. Switch `query` only when the parent themselves names a different activity. For 'more' or 'any others?', bump `page` rather than saying there are no more.",
    "",
    "- PLAN requests ('help me choose', 'what should my 6yo focus on', 'a well-rounded week'): don't send them away empty. Search broadly for their age and show a spread across different kinds of activity, active, hands-on, creative, and group-based, so they can see the range. Say plainly that the right mix depends on what the child enjoys, and ask ONE question about that. Never present a required set, a checklist, or anything a child needs.",
    // Discovery-only. The venue chat has one location, so an area exclusion is
    // meaningless there and offering to search elsewhere would break confinement.
    "- EXCLUSIONS: when a parent asks for anything EXCEPT an area, put that area in `excludeDistrict` and leave `district` unset — setting it as `district` returns exactly what they ruled out. Excluding a PROVIDER is still not something you can do: say so plainly rather than filtering by area instead.",
    "- Special or additional needs, disability, or inclusion: acknowledge it warmly, search the activity as normal, and since the catalogue does not flag inclusion support, suggest they confirm suitability directly with the provider. Never brush the need aside or claim a result is verified inclusive.",
    sectionClause(opts.sections),
    "",
    CONCIERGE_REPLY,
    // No chip/tag line: the discovery reply is plain warm prose. Any follow-up
    // question is just part of the message (there is no SUGGESTIONS or QUESTIONS tag).
  ].join("\n");
}
