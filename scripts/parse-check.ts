import { readFileSync, writeFileSync } from "fs";
import { parseWorkbook } from "../lib/parser";
(async () => {
  const pf = await parseWorkbook(readFileSync("data/scheda.xlsx"));
  writeFileSync(process.env.OUT || "/tmp/claude-0/out.json", JSON.stringify(pf, null, 1));
  console.log("athlete", pf.athlete);
  for (const p of pf.programs) {
    console.log("==", p.id, p.title, p.startDate, p.endDate, "weeks", p.weeks.length, "notes", p.notes.length, "guid", p.guidelines.length, "supp", p.supplements.length);
    for (const w of p.weeks) console.log("  W", w.index, w.workouts.map(x => `${x.key}:${x.exercises.length}(${x.focus})${x.cardio.join('|')}`).join(" "), "diet", w.diet.map(d => d.kcal).join(","));
  }
})();
