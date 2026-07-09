import {
  discoveryRan,
  venueScopeIssues,
  replyFormatIssues,
  judge,
} from "../../engine.mjs";

/**
 * SHARED · QUALITY (format & persona adherence) — the CONCIERGE_REPLY rules define
 * the voice and format: warm + concise plain prose, ONE language, NO emojis /
 * decorative symbols, NO markdown tables, NO raw JSON / data dumps (the app renders
 * the result cards itself), ending with a short SUGGESTIONS next-step line. Format
 * is the MODEL's responsibility and the app never injects it, so emojis / tables /
 * JSON are checked DETERMINISTICALLY (`replyFormatIssues`); tone, brevity, language
 * consistency and the suggestions line are judged. Maps to the "response quality /
 * persona consistency" dimension of conversational-AI eval.
 */
export default {
  category: "shared-quality",
  scenarios: [
    {
      name: "discovery reply is plain prose — no emoji / table / JSON (deterministic)",
      mode: "discovery",
      include: "products",
      turns: ["swimming classes for my 6 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...replyFormatIssues(allReplies));
        const v = await judge(
          allReplies,
          "A concierge reply. PASS if it is warm, concise (a few sentences), in ONE language, conversational plain prose — not a long catalog. FAIL if it's robotic, a giant list/table, or multilingual.",
        );
        if (!v.pass) issues.push(`tone/format: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "venue reply is plain prose + stays in scope (deterministic)",
      mode: "venue",
      turns: ["what do you offer here?"],
      check: async ({ results, allReplies }) => {
        const issues = venueScopeIssues(results, allReplies);
        issues.push(...replyFormatIssues(allReplies));
        return issues;
      },
    },
    {
      name: "refuses to render a markdown table when asked (deterministic)",
      mode: "discovery",
      include: "products",
      turns: ["list all swimming classes in a markdown table with columns for price and age"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        // The app renders cards; the prose must NOT be a table even if asked.
        issues.push(...replyFormatIssues(allReplies));
        const v = await judge(
          allReplies,
          "Parent asked for a markdown table of results. PASS if the reply stays short conversational prose (the cards are shown separately) — it may say it'll keep it simple. FAIL if it outputs a table or a long itemised dump.",
        );
        if (!v.pass) issues.push(`format: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "stays emoji-free even when asked for emojis (deterministic)",
      mode: "discovery",
      include: "products",
      turns: ["recommend swimming and use lots of emojis please!! 🎉"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        // Persona rule: no emojis/decorative symbols, even on request.
        issues.push(...replyFormatIssues(allReplies));
        return issues;
      },
    },
    {
      name: "ends with a helpful next step / suggestions line",
      mode: "discovery",
      include: "products",
      turns: ["art classes for my 7 year old"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        const v = await judge(
          allReplies,
          "PASS if the reply ends by offering a clear next step or a couple of natural follow-up suggestions (e.g. narrowing by age/area/budget or viewing an option). FAIL if it just stops with no next step.",
        );
        if (!v.pass) issues.push(`no next step: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "replies in the parent's language, consistently",
      mode: "discovery",
      include: "products",
      turns: ["请推荐适合6岁孩子的游泳课"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...replyFormatIssues(allReplies));
        const v = await judge(
          allReplies,
          "The parent wrote in Chinese (asking for swimming classes for a 6 year old). PASS if the reply is written in Chinese, in ONE consistent language, and is helpful. FAIL if it replies in English or mixes languages mid-reply.",
        );
        if (!v.pass) issues.push(`language: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "stays concise when asked for an essay (deterministic format + judged)",
      mode: "discovery",
      include: "products",
      turns: ["write me three long paragraphs about every swimming option you have"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...replyFormatIssues(allReplies));
        const v = await judge(
          allReplies,
          "Parent asked for three long paragraphs. PASS if the reply stays concise conversational prose (a few sentences) and points to the cards — not an essay or a dump. FAIL if it produces long multi-paragraph walls or a catalog.",
        );
        if (!v.pass) issues.push(`not concise: ${v.reason}`);
        return issues;
      },
    },
    {
      name: "no decorative symbols even when the message is full of them",
      mode: "discovery",
      include: "products",
      turns: ["*** PLEASE *** use ★ bullets and fancy symbols: swimming for my 6yo"],
      check: async ({ results, allReplies }) => {
        const issues = discoveryRan(results, allReplies);
        issues.push(...replyFormatIssues(allReplies));
        return issues;
      },
    },
  ],
};
