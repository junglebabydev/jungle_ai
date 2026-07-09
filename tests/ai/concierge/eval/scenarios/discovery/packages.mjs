import { discoveryRan, judge } from "../../engine.mjs";

/**
 * DISCOVERY · PACKAGES — the global catalogue exposes a PACKAGES section (multi-session
 * passes / memberships from PackageTemplate, indexed in Typesense). When the FE
 * 'Packages' tab is active (include=packages) the search returns them, and the model
 * MUST be able to name/summarise the real packages — not claim there are none. This
 * guards the section end-to-end: (a) the envelope carries packages, and (b) the reply
 * actually uses them. It is the regression guard for the bug where the search returned
 * packages as cards but the model's tool result omitted them, so it replied "I didn't
 * find any packages".
 */
const packagesReturned = (results) => (results?.packages?.total ?? 0) > 0;

// Judged package probe with the Packages tab active: a search ran + no leak, and the
// reply handles package/membership intent honestly — surfaces real packages when they
// exist, or says none / it can't confirm, and never fabricates a specific package or
// policy.
const packageCase = (name, turn, rubric) => ({
  name,
  mode: "discovery",
  include: ["packages"],
  turns: [turn],
  check: async ({ results, allReplies }) => {
    const issues = discoveryRan(results, allReplies);
    const total = results?.packages?.total ?? 0;
    const v = await judge(
      allReplies,
      `A parent asking about class packages / memberships (the Packages tab is active; ${total} package(s) returned). PASS if the reply surfaces package/membership options grounded in the real results, OR honestly says none match / it can't confirm that specific detail. ${rubric} FAIL if it claims there are NO packages when the list is non-empty, or invents a specific package or policy.`,
    );
    if (!v.pass) issues.push(`packages: ${v.reason}`);
    return issues;
  },
});

export default {
  category: "discovery-packages",
  scenarios: [
    {
      name: "'Packages' tab returns real packages (deterministic)",
      mode: "discovery",
      include: ["packages"],
      turns: ["any class packages or membership bundles?"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        if (!packagesReturned(results))
          issues.push(
            "packages section empty when include=packages (expected real packages)",
          );
        return issues;
      },
    },
    {
      name: "model surfaces the returned packages, doesn't claim none exist (judged)",
      mode: "discovery",
      include: ["packages"],
      turns: ["show me multi-session passes or packages"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const names = (results?.packages?.data || [])
          .map((p) => p.name)
          .slice(0, 6);
        const v = await judge(
          allReplies,
          `The search returned these real PACKAGES: ${JSON.stringify(names)} (total ${results?.packages?.total ?? 0}). PASS if the reply acknowledges/surfaces package or membership options grounded in those real results. FAIL if it claims there are NO packages/bundles while the list is non-empty, or invents a package not listed.`,
        );
        if (!v.pass) issues.push(`packages: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "packages + products together (mixed tab) still surfaces packages",
      mode: "discovery",
      include: ["products", "packages"],
      turns: ["classes and any package deals for my 6 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          `A parent asked for classes AND package deals. The search returned packages (total ${results?.packages?.total ?? 0}). PASS if the reply covers activities and, when packages exist, mentions package/bundle options honestly. FAIL if it ignores packages that exist or fabricates one.`,
        );
        if (!v.pass) issues.push(`mixed: ${v.reason}`);
        return issues;
      },
    },
    // --- additional package / membership cases ---
    packageCase("10-session swim pack", "do you have 10-session swim packages?", "Intent: a 10-session swim package."),
    packageCase("unlimited monthly membership", "monthly membership for unlimited play", "Intent: an unlimited monthly membership."),
    packageCase("art term bundle", "term bundles for art classes", "Intent: term bundles for art."),
    packageCase("cross-activity pass", "multi-class passes I can use across activities", "Intent: a pass usable across activities."),
    packageCase("package for two kids", "a package that covers two kids", "Intent: a package covering two children."),
    packageCase("prepaid drop-in credits", "prepaid credits for drop-in sessions", "Intent: prepaid credits for casual drop-ins."),
    packageCase("bundle two activities", "any bundle deals for swimming and gymnastics?", "Intent: a swim+gymnastics bundle."),
    packageCase("family membership", "family membership options", "Intent: family membership options."),
    packageCase("multi-location pass", "a pass that works at multiple locations", "Intent: a pass valid across locations."),
    packageCase("full-term discount pack", "discounted packages for booking a full term", "Intent: a discounted full-term package."),
    packageCase("trial before membership", "a trial package before a full membership", "Intent: a trial before committing to membership."),
    packageCase("multi-week camp bundle", "holiday camp bundles for multiple weeks", "Intent: a multi-week camp bundle."),
    packageCase("rollover policy (honest)", "do memberships roll over if we miss a class?", "Intent: a rollover-policy question; discovery has no policy data — it must be honest, not invent a policy."),
    packageCase("pausable package (honest)", "flexible packages I can pause", "Intent: a pausable package; honest if it can't confirm the terms."),
    packageCase("weekend-only package", "packages for weekend classes only", "Intent: a weekend-only package."),
    packageCase("sessions per package", "how many sessions are in your class packages?", "Intent: number of sessions; grounded in the real packages, not invented."),
    packageCase("membership with trials", "membership that includes free trials of other activities", "Intent: a membership bundling trials of other activities."),
    packageCase("loyalty deals (honest)", "any loyalty or returning-member deals?", "Intent: loyalty deals; honest if it can't confirm specific ones."),
    packageCase("sibling same-class pack", "packages for siblings taking the same class", "Intent: a sibling package for the same class."),
    packageCase("casual drop-in value pack", "a value pack for casual drop-in play", "Intent: a value pack for drop-in play."),
  ],
};
