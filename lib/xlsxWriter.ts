// A small .xlsx writer with cell styles (fonts, fills, borders, alignment, row
// heights, column widths, freeze panes). The community SheetJS build cannot write
// styles, and the office's timetable format depends on them, so the workbook XML
// is produced here and zipped with JSZip (Node and browser alike).

export interface CellStyle {
  bold?: boolean;
  size?: number;          // points
  color?: string;         // "RRGGBB"
  fill?: string;          // "RRGGBB"
  border?: boolean;       // thin border on all sides
  align?: "center" | "left" | "right";
  wrap?: boolean;
}

export interface Cell { v: string | number | null; s?: number }
export interface Row { h?: number; cells: Cell[] }
export interface Sheet { name: string; cols?: number[]; rows: Row[]; freeze?: string }

export interface Workbook {
  styles: CellStyle[];   // index 0 is the default
  sheets: Sheet[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => { let s = ""; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

function stylesXml(styles: CellStyle[]): string {
  const fonts: string[] = [];
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders: string[] = ["<border><left/><right/><top/><bottom/><diagonal/></border>", '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>'];
  const xfs: string[] = [];
  const fontKey = new Map<string, number>(); const fillKey = new Map<string, number>();
  for (const st of styles) {
    const fk = `${st.bold ? 1 : 0}|${st.size ?? 11}|${st.color ?? "000000"}`;
    if (!fontKey.has(fk)) { fontKey.set(fk, fonts.length); fonts.push(`<font>${st.bold ? "<b/>" : ""}<sz val="${st.size ?? 11}"/><color rgb="FF${st.color ?? "000000"}"/><name val="Calibri"/><family val="2"/></font>`); }
    let fillIdx = 0;
    if (st.fill) { if (!fillKey.has(st.fill)) { fillKey.set(st.fill, fills.length); fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`); } fillIdx = fillKey.get(st.fill)!; }
    const align = st.align || st.wrap ? `<alignment${st.align ? ` horizontal="${st.align}"` : ""} vertical="center"${st.wrap ? ' wrapText="1"' : ""}/>` : "";
    xfs.push(`<xf numFmtId="0" fontId="${fontKey.get(fk)}" fillId="${fillIdx}" borderId="${st.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="${st.fill ? 1 : 0}" applyBorder="${st.border ? 1 : 0}" applyAlignment="${align ? 1 : 0}">${align}</xf>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${fonts.length}">${fonts.join("")}</fonts>
<fills count="${fills.length}">${fills.join("")}</fills>
<borders count="${borders.length}">${borders.join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.cols?.length ? `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  let pane = "";
  if (sheet.freeze) {
    const m = sheet.freeze.match(/^([A-Z]+)(\d+)$/);
    if (m) {
      const xSplit = m[1].split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const ySplit = Number(m[2]) - 1;
      const active = xSplit && ySplit ? "bottomRight" : xSplit ? "topRight" : "bottomLeft";
      pane = `<sheetViews><sheetView workbookViewId="0"><pane${xSplit ? ` xSplit="${xSplit}"` : ""}${ySplit ? ` ySplit="${ySplit}"` : ""} topLeftCell="${sheet.freeze}" activePane="${active}" state="frozen"/></sheetView></sheetViews>`;
    }
  }
  const rows = sheet.rows.map((r, ri) => {
    const cells = r.cells.map((c, ci) => {
      if (c.v === null || c.v === undefined || c.v === "") return c.s ? `<c r="${colName(ci)}${ri + 1}" s="${c.s}"/>` : "";
      const ref = `${colName(ci)}${ri + 1}`;
      const s = c.s ? ` s="${c.s}"` : "";
      if (typeof c.v === "number") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}"${r.h ? ` ht="${r.h}" customHeight="1"` : ""}>${cells}</row>`;
  }).join("");
  const maxCols = Math.max(1, ...sheet.rows.map((r) => r.cells.length));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${colName(maxCols - 1)}${Math.max(1, sheet.rows.length)}"/>${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

const safeSheetName = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";

/** Build the workbook and return the .xlsx bytes. `JSZipCtor` is the JSZip class (import on the server, global in the browser). */
export async function writeXlsx(wb: Workbook, JSZipCtor: any): Promise<Uint8Array> {
  const zip = new JSZipCtor();
  const n = wb.sheets.length;
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${wb.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wb.sheets.map((s, i) => `<sheet name="${esc(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", stylesXml(wb.styles));
  wb.sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
