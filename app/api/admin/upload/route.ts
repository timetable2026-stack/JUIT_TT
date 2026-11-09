// Admin: upload the master Excel. Accepts either the portal's row format or the
// department's own day x period grid workbook, which is detected and converted
// automatically so the office can upload the file it already maintains.
import { requireAdmin } from "@/lib/auth";
import { changesByFaculty, diffDatasets, summarize } from "@/lib/diff";
import { parseSheets, workbookToCells, workbookToSheets, type RawRow } from "@/lib/excel";
import { gridToSheets, guessTerm, looksLikeGrid, mergeFacultyDetails } from "@/lib/grid";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(req: Request) {
  const denied = requireAdmin(req); if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Attach the Excel file as 'file'." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: "That file is larger than 15 MB. Save it as .xlsx and try again." }, { status: 400 });

  const XLSX = await import("xlsx");
  let wb: any;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
  } catch (e: any) {
    return Response.json({ error: `That file could not be opened as a spreadsheet (${e?.message ?? e}). Save it from Excel as .xlsx and try again.` }, { status: 400 });
  }

  const store = getStore();
  const live = await store.getPublished();

  // Which layout is this? Row format has a sheet literally named "Timetable".
  const cells = workbookToCells(XLSX, wb);
  const hasRowSheet = wb.SheetNames.some((n: string) => n.trim().toLowerCase() === "timetable");
  const gridSheets = cells.filter(looksLikeGrid);
  let sheets: Partial<Record<string, RawRow[]>>;
  let conversion: { used: boolean; groups: string[]; report: { sheet: string; day: string; classes: number }[]; notes: string[]; carriedFaculty: number } | null = null;

  if (!hasRowSheet && gridSheets.length > 0) {
    const term = live?.data.semesters[0]
      ? { start: live.data.semesters[0].startDate, end: live.data.semesters[0].endDate, year: live.data.semesters[0].academicYear, exams: live.data.semesters[0].examWindow }
      : guessTerm();
    const g = gridToSheets(cells, term);
    // Keep the names and emails the office has already filled in.
    const merged = mergeFacultyDetails(g.sheets.Faculty ?? [], live?.data.faculty ?? []);
    g.sheets.Faculty = merged.rows;
    sheets = g.sheets;
    conversion = { used: true, groups: g.groups, report: g.report, notes: g.notes.slice(0, 40), carriedFaculty: merged.carried };
  } else {
    sheets = workbookToSheets(XLSX, wb);
    if (!sheets.Timetable) {
      return Response.json({
        error: `This workbook has no "Timetable" sheet and no day-by-period grid that could be read. Sheets found: ${wb.SheetNames.join(", ")}. Download the blank template to see the expected layout.`,
      }, { status: 400 });
    }
  }

  const parsed = parseSheets(sheets);
  const changes = parsed.ok ? diffDatasets(live?.data ?? null, parsed.data) : [];

  let draftId: number | null = null;
  if (parsed.ok) {
    const draft = await store.createVersion({
      status: "draft", createdAt: new Date().toISOString(), fileName: file.name,
      data: parsed.data, changes, issues: parsed.issues, summary: summarize(parsed.data, changes),
    });
    draftId = draft.id;
  }
  const byFaculty = Object.fromEntries([...changesByFaculty(changes)].map(([fid, cs]) => [fid, cs.map((c) => c.id)]));
  return Response.json({
    ok: parsed.ok, draftId, fileName: file.name, issues: parsed.issues, changes, byFaculty,
    summary: parsed.ok ? summarize(parsed.data, changes) : null,
    isFirstPublish: !live, conversion,
    data: parsed.ok ? parsed.data : null,
  });
}

export const POST = (req: Request) => withErrors(() => handlePOST(req));

/** Turn any unexpected failure into a readable message instead of a bare 500. */
async function withErrors(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); }
  catch (e: any) {
    const msg = String(e?.message ?? e);
    const hint = /EROFS|read-only|ENOENT|EACCES/i.test(msg)
      ? " The server could not write its data file. Connect the database (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables) and redeploy."
      : /relation .* does not exist|schema cache/i.test(msg)
      ? " The database tables are missing: run supabase/schema.sql in the Supabase SQL editor."
      : "";
    console.error(msg);
    return Response.json({ error: `Something went wrong: ${msg}.${hint}` }, { status: 500 });
  }
}
