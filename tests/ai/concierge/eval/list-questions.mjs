/**
 * Print every question this eval asks — for review, or to build a dataset (e.g. for
 * fine-tuning). The questions live inside the scenario files; this just collects them.
 *
 *   node tests/ai/concierge/eval/list-questions.mjs          # readable list
 *   node tests/ai/concierge/eval/list-questions.mjs --json    # JSON array
 *
 * (The merchant eval has the same script.)
 */
import scenarios from "./all-scenarios.mjs";

const rows = scenarios.map((s) => ({
  group: s.group ?? s.category,
  name: s.name,
  turns: Array.isArray(s.turns) ? s.turns : [s.turns],
}));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const r of rows) console.log(`[${r.group}] ${r.name}\n   ${r.turns.join("  ⇢  ")}`);
  console.log(`\n${rows.length} questions`);
}
