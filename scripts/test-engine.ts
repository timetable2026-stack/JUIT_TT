// Runs the full pipeline on the sample data without Next or SheetJS:
// parse v1 → publish → parse v2 → diff → publish → emails (skipped) → ICS.
import { readFileSync } from "node:fs";
import { parseSheets } from "../lib/excel";
import { diffDatasets, changesByFaculty } from "../lib/diff";
import { changeEmail, firstPublishEmail, icsForFaculty } from "../lib/format";
import { publishDataset } from "../lib/publish";
import { getStore } from "../lib/store";

process.env.LOCAL_DB_PATH = process.env.LOCAL_DB_PATH ?? "/tmp/tt-test-db.json";
const v1 = JSON.parse(readFileSync(process.argv[2], "utf8"));
const v2 = JSON.parse(readFileSync(process.argv[3], "utf8"));

const p1 = parseSheets(v1);
console.log("v1 ok:", p1.ok, "slots:", p1.data.slots.length, "faculty:", p1.data.faculty.length, "issues:", p1.issues.length);
for (const i of p1.issues) console.log("  ", i.level, i.sheet, i.row ?? "", i.message);
if (!p1.ok) process.exit(1);

const p2 = parseSheets(v2);
console.log("v2 ok:", p2.ok, "issues:", p2.issues.length);
for (const i of p2.issues.filter((x) => x.level === "error")) console.log("  ERR", i.sheet, i.row ?? "", i.message);
const changes = diffDatasets(p1.data, p2.data);
console.log("\nchanges:", changes.length);
for (const c of changes) console.log(`  [${c.type}] ${c.text}  → ${c.affectedFacultyIds.join(",")}`);
console.log("\nby faculty:", [...changesByFaculty(changes)].map(([f, cs]) => `${f}:${cs.length}`).join(" "));

// Negative test: a clash should be an error
const bad = structuredClone(v1);
bad.Timetable.push({ Semester: "Sem 3", Section: "A", Day: "Mon", Period: 1, "Subject code": "XX100", "Subject name": "Clash", Type: "Lecture", "Faculty ID": bad.Timetable[0]["Faculty ID"], Room: "LH-9" });
bad.Timetable.push({ Semester: "Sem 9", Section: "A", Day: "Fun", Period: 12, "Subject code": "", "Subject name": "Bad", Type: "Dance", "Faculty ID": "FAC999", Room: "" });
const pb = parseSheets(bad);
console.log("\nnegative test ok=false:", pb.ok, "errors:", pb.issues.filter((i) => i.level === "error").length);
for (const i of pb.issues.filter((i) => i.level === "error")) console.log("  ERR", i.sheet, i.row ?? "", i.message);

// Emails
const f = p2.data.faculty[1];
const e1 = firstPublishEmail({ data: p1.data, faculty: f, siteUrl: "https://timetable.juitsolan.ac.in", department: "CSE", semesterNames: ["Sem 3", "Sem 5", "Sem 7"] });
console.log("\nfirst-publish subject:", e1.subject, "| html bytes:", e1.html.length);
const mine = changesByFaculty(changes).get(f.id) ?? [];
const e2 = changeEmail({ data: p2.data, faculty: f, changes: mine, siteUrl: "https://timetable.juitsolan.ac.in", department: "CSE", versionId: 2, note: "LH-1 under repair" });
console.log("change subject:", e2.subject);
console.log("ICS lines:", icsForFaculty(p2.data, f.id, "test", 2).split("\r\n").length);

// Store pipeline
import { rmSync } from "node:fs";
(async () => {
// Store pipeline
try { rmSync(process.env.LOCAL_DB_PATH!); } catch {}
const r1 = await publishDataset({ data: p1.data, issues: p1.issues, fileName: "v1.xlsx", sendEmail: true });
console.log("\npublished v", r1.version.id, "status", r1.version.status, "emails", r1.emails);
const r2 = await publishDataset({ data: p2.data, issues: p2.issues, fileName: "v2.xlsx", note: "LH-1 under repair", sendEmail: true });
console.log("published v", r2.version.id, "changes", r2.version.summary, "emails", r2.emails);
const store = getStore();
console.log("versions:", (await store.listVersions()).map((v) => `${v.id}:${v.status}`).join(" "), "| log:", (await store.listEmailLog()).length);
})();
