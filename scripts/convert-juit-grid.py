"""Converts the JUIT grid-format master timetable (Year sheets with days down and
periods across) into the portal's row format, and writes a ready-to-upload workbook.

Usage:  python3 scripts/convert-juit-grid.py <source.xlsx> <output.xlsx> [--json out.json]

Source layout it expects (as in Timetable_Jan_Jun_2027):
  * one sheet per year group ("Year 1", "Year 2", "Year3", "Year 4", "PG1", ...)
  * row 1: merged time headers every 5 columns, e.g. "09:00-10:00"
  * row 2: repeating sub-headers  L-T-P | Sub Code | Batch | Faculty | Room
  * column B: the day name, merged down that day's block of parallel-class rows
  * optional sheets "Faculty view" (Faculty, Dept), "DLC fallbacks"/"Not placed" (course names)
"""
import json
import re
import sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

DAY_MAP = {"MON": "Mon", "TUE": "Tue", "WED": "Wed", "THU": "Thu", "FRI": "Fri", "SAT": "Sat"}
TYPE_MAP = {"L": "Lecture", "T": "Tutorial", "P": "Lab", "S": "Seminar", "PR": "Project"}
SKIP_SHEETS = {"faculty view", "room view", "elective slots", "checks and utilisation",
               "faculty load", "not placed", "dlc fallbacks", "data corrections"}


def cell(ws, r, c):
    v = ws.cell(r, c).value
    return "" if v is None else str(v).strip()


def period_columns(ws):
    """[(period_number, 'HH:MM', 'HH:MM', first_column_index)] from the merged row-1 headers."""
    out = []
    for c in range(1, ws.max_column + 1):
        v = cell(ws, 1, c)
        m = re.match(r"^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$", v)
        if m:
            out.append((m.group(1).zfill(5), m.group(2).zfill(5), c))
    out.sort(key=lambda x: x[2])
    return [(i + 1, s, e, c) for i, (s, e, c) in enumerate(out)]


def day_blocks(ws, max_row):
    """[(day, first_row, last_row)] from the merged day column (B)."""
    marks = []
    for r in range(1, max_row + 1):
        v = cell(ws, r, 2).upper()
        if v in DAY_MAP:
            marks.append((DAY_MAP[v], r))
    blocks = []
    for i, (day, start) in enumerate(marks):
        end = marks[i + 1][1] - 1 if i + 1 < len(marks) else max_row
        blocks.append((day, start, end))
    return blocks


def collect_course_names(wb):
    """code -> course name, from the auxiliary sheets that carry both."""
    names = {}
    for sheet, code_col, name_col, header_row in (("DLC fallbacks", 4, 5, 2), ("Not placed", 3, 4, 2)):
        if sheet not in wb.sheetnames:
            continue
        ws = wb[sheet]
        for r in range(header_row + 1, ws.max_row + 1):
            code, name = cell(ws, r, code_col), cell(ws, r, name_col)
            if code and name and code not in names:
                names[code] = name
    return names


def collect_faculty(wb, used_codes):
    """code -> dept, from 'Faculty view' where present; every code actually used is included."""
    dept = {}
    if "Faculty view" in wb.sheetnames:
        ws = wb["Faculty view"]
        header = next((r for r in range(1, 8) if cell(ws, r, 1).lower() == "faculty"), 3)
        for r in range(header + 1, ws.max_row + 1):
            code = cell(ws, r, 1)
            if code:
                dept[code] = cell(ws, r, 2)
    return [(c, dept.get(c, "")) for c in sorted(used_codes)]


def split_faculty(raw):
    """'JBSW_RS13' is one code; 'NSA;DGA' or 'NSA + DGA' or 'NSA/DGA' are several."""
    parts = re.split(r"[;,&+/]| and ", raw)
    return [p.strip().upper() for p in parts if p.strip()]


def convert(src_path):
    wb = load_workbook(src_path, data_only=True)
    course_names = collect_course_names(wb)
    rows, used_faculty, periods_seen, warnings = [], set(), {}, []

    for sheet in wb.sheetnames:
        if sheet.strip().lower() in SKIP_SHEETS:
            continue
        ws = wb[sheet]
        periods = period_columns(ws)
        if not periods:
            warnings.append(f'Sheet "{sheet}" has no time headers in row 1 — skipped.')
            continue
        semester = re.sub(r"\s+", " ", sheet.strip())
        semester = re.sub(r"^Year\s*(\d)$", r"Year \1", semester)
        for p_no, start, end, _ in periods:
            periods_seen[p_no] = (start, end)

        for day, r0, r1 in day_blocks(ws, ws.max_row):
            for r in range(r0, r1 + 1):
                for p_no, start, end, c0 in periods:
                    ltp = cell(ws, r, c0)
                    code = cell(ws, r, c0 + 1)
                    batch = cell(ws, r, c0 + 2)
                    fac = cell(ws, r, c0 + 3)
                    room = cell(ws, r, c0 + 4)
                    if not code and not fac:
                        continue
                    if not code:
                        warnings.append(f"{sheet} row {r} P{p_no}: faculty '{fac}' with no subject code — skipped.")
                        continue
                    ctype = TYPE_MAP.get(ltp.upper().strip(), "Lecture")
                    fids = split_faculty(fac)
                    used_faculty.update(fids)
                    rows.append({
                        "Semester": semester,
                        "Section": "",
                        "Day": day,
                        "Period": p_no,
                        "Start": start,
                        "End": end,
                        "Subject code": code,
                        "Subject name": course_names.get(code, code),
                        "Type": ctype,
                        "Faculty ID": ";".join(fids),
                        "Room": room or "TBA",
                        "Batch": batch,
                        "Notes": "",
                    })

    faculty = collect_faculty(wb, used_faculty)
    periods_out = [{"Period": p, "Start": s, "End": e,
                    "Break": "", "Label": ""}
                   for p, (s, e) in sorted(periods_seen.items())]
    semesters = sorted({r["Semester"] for r in rows})
    return rows, faculty, periods_out, semesters, warnings


def write_workbook(path, rows, faculty, periods, semesters, term):
    wb = Workbook()
    head_font, head_fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F3A5F")

    def sheet(ws, headers, data, widths):
        ws.append(headers)
        for c in range(1, len(headers) + 1):
            ws.cell(1, c).font = head_font
            ws.cell(1, c).fill = head_fill
            ws.cell(1, c).alignment = Alignment(vertical="center")
            ws.column_dimensions[get_column_letter(c)].width = widths[c - 1]
        for d in data:
            ws.append([d.get(h, "") if isinstance(d, dict) else d[i] for i, h in enumerate(headers)])
        ws.freeze_panes = "A2"

    ws = wb.active
    ws.title = "Timetable"
    sheet(ws, ["Semester", "Section", "Day", "Period", "Start", "End", "Subject code",
               "Subject name", "Type", "Faculty ID", "Room", "Batch", "Notes"],
          rows, [10, 8, 7, 8, 8, 8, 14, 40, 10, 16, 14, 30, 18])
    sheet(wb.create_sheet("Faculty"), ["Faculty ID", "Full name", "Email", "Department", "Designation", "Phone", "Role"],
          [{"Faculty ID": c, "Full name": c, "Email": "", "Department": d, "Designation": "", "Phone": "", "Role": "Faculty"}
           for c, d in faculty], [12, 26, 34, 12, 20, 12, 9])
    sheet(wb.create_sheet("Periods"), ["Period", "Start", "End", "Break", "Label"], periods, [8, 9, 9, 8, 10])
    sheet(wb.create_sheet("Semesters"), ["Semester", "Start date", "End date", "Academic year", "Exam window"],
          [{"Semester": s, "Start date": term["start"], "End date": term["end"],
            "Academic year": term["year"], "Exam window": term["exams"]} for s in semesters], [10, 12, 12, 14, 24])
    wb.save(path)


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    term = {"start": "2027-01-04", "end": "2027-06-04", "year": "2026-27", "exams": ""}
    rows, faculty, periods, semesters, warnings = convert(src)
    write_workbook(out, rows, faculty, periods, semesters, term)
    print(f"{len(rows)} class rows · {len(faculty)} faculty codes · {len(periods)} periods · {len(semesters)} groups: {', '.join(semesters)}")
    for w in warnings[:20]:
        print("  warning:", w)
    if "--json" in sys.argv:
        dest = sys.argv[sys.argv.index("--json") + 1]
        json.dump({
            "Timetable": rows,
            "Faculty": [{"Faculty ID": c, "Full name": c, "Email": "", "Department": d,
                         "Designation": "", "Phone": "", "Role": "Faculty"} for c, d in faculty],
            "Periods": periods,
            "Semesters": [{"Semester": s, "Start date": term["start"], "End date": term["end"],
                           "Academic year": term["year"], "Exam window": term["exams"]} for s in semesters],
        }, open(dest, "w"))
        print("wrote", dest)
