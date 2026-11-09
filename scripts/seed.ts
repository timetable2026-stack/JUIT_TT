// Publishes sample/Timetable_Sample_v1.xlsx into the configured store (local file or Supabase).
// Usage: npx tsx scripts/seed.ts [path-to-xlsx]
import { readFileSync } from "node:fs";
import { parseSheets, workbookToSheets } from "../lib/excel";
import { publishDataset } from "../lib/publish";

(async () => {
  const XLSX = await import("xlsx");
  const file = process.argv[2] ?? "sample/Timetable_Sample_v1.xlsx";
  const wb = XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });
  const parsed = parseSheets(workbookToSheets(XLSX, wb));
  for (const i of parsed.issues) console.log(i.level, i.sheet, i.row ?? "", i.message);
  if (!parsed.ok) { console.error("Fix the errors above first."); process.exit(1); }
  const r = await publishDataset({ data: parsed.data, issues: parsed.issues, fileName: file.split("/").pop(), note: "Seeded from sample", sendEmail: false });
  console.log("Published version", r.version.id, r.version.summary);
})();
