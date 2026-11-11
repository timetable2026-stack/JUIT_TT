"use client";
import { useEffect, useMemo, useState } from "react";
import type { Stats } from "@/lib/stats";
import { SearchSelect } from "./SearchSelect";

async function api<T>(url: string): Promise<T> { const r = await fetch(url); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`); return j as T; }

export function Statistics() {
  const [st, setSt] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [sort, setSort] = useState<keyof Stats["faculty"][number]>("load");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [roomKind, setRoomKind] = useState("all");
  useEffect(() => { api<Stats>("/api/admin/stats").then(setSt).catch((e) => setErr(e.message)); }, []);

  const rows = useMemo(() => {
    if (!st) return [];
    const l = q.toLowerCase();
    return st.faculty.filter((f) => (dept === "all" || f.dept === dept) && (!l || `${f.name} ${f.id} ${f.dept}`.toLowerCase().includes(l)))
      .sort((a, b) => { const x = a[sort] as any, y = b[sort] as any; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir; });
  }, [st, q, dept, sort, dir]);

  if (err) return <div className="card"><div className="notice bad">{err}</div></div>;
  if (!st) return <div className="card muted"><span className="spinner" /> Working out the statistics…</div>;
  const o = st.overall;
  const maxDept = Math.max(...st.departments.map((d) => d.avg), 1);
  const maxBucket = Math.max(...st.distribution.map((b) => b.count), 1);
  const maxHeat = Math.max(...st.heatmap.flatMap((h) => h.periods.map((p) => p.classes)), 1);
  const th = (key: keyof Stats["faculty"][number], label: string) => <th style={{ cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => { if (sort === key) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(key); setDir(key === "name" || key === "dept" || key === "id" ? 1 : -1); } }} aria-sort={sort === key ? (dir === 1 ? "ascending" : "descending") : "none"}>{label}{sort === key ? (dir === 1 ? " ▲" : " ▼") : ""}</th>;
  const vs = (n: number) => <span className={`pill ${n >= 25 ? "warn" : n <= -25 ? "info" : "good"}`}>{n > 0 ? "+" : ""}{n}%</span>;
  const rooms = st.rooms.filter((r) => roomKind === "all" || r.kind === roomKind);

  return (
    <>
      <div className="card">
        <div className="row between">
          <div><h2>Load &amp; statistics</h2><p className="muted small" style={{ margin: "4px 0 0" }}>From timetable version {st.generatedFor.versionId}. Load = periods per week; a 2-period lab counts 2; a class taught by two people counts for each; TBA is excluded.</p></div>
          <a className="btn primary sm" href="/api/admin/stats?format=xlsx" data-export="stats" download>⬇ Export all tables (Excel)</a>
        </div>
        <div className="grid stats" style={{ marginTop: 14 }}>
          <div className="stat"><div className="n">{o.avgLoad}</div><div className="l">average load / week</div></div>
          <div className="stat"><div className="n">{o.medianLoad}</div><div className="l">median load</div></div>
          <div className="stat"><div className="n">{o.minLoad}–{o.maxLoad}</div><div className="l">lowest – highest</div></div>
          <div className="stat"><div className="n">{o.teachingFaculty}</div><div className="l">faculty teaching · {o.departments} depts</div></div>
          <div className="stat"><div className="n">{o.classes}</div><div className="l">classes / week</div></div>
          <div className="stat"><div className="n">{o.lectures} · {o.labs} · {o.tutorials}</div><div className="l">lectures · labs · tutorials</div></div>
          <div className="stat"><div className="n">{o.roomUtilisation}%</div><div className="l">room utilisation · {o.rooms} rooms</div></div>
          <div className="stat"><div className="n">{o.avgSectionPeriods}</div><div className="l">avg periods per section · {o.sections} sections</div></div>
          {o.unassigned > 0 && <div className="stat" style={{ background: "var(--warn-bg)" }}><div className="n" style={{ color: "var(--warn)" }}>{o.unassigned}</div><div className="l">periods with no faculty (TBA)</div></div>}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Average load by department</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Department</th><th>Faculty</th><th>Average</th><th>Median</th><th>Range</th><th>Share</th></tr></thead>
            <tbody>{st.departments.map((d) => <tr key={d.dept}>
              <td><b>{d.dept}</b>{d.zeroLoad ? <div className="small muted">{d.zeroLoad} with no classes</div> : null}</td><td>{d.faculty}</td>
              <td style={{ minWidth: 150 }}><div className="bar"><span style={{ width: `${(d.avg / maxDept) * 100}%` }} /><b>{d.avg}</b></div></td>
              <td>{d.median}</td><td className="small">{d.min}–{d.max}</td><td className="small">{d.share}%</td>
            </tr>)}</tbody>
          </table></div>
          <p className="muted small" style={{ marginTop: 8 }}>University average {o.avgLoad}; departments above it carry a heavier teaching week per person.</p>
        </div>
        <div className="card">
          <h3>How load is spread</h3>
          <div className="dist">{st.distribution.map((b) => <div key={b.bucket} className="dist-row"><span className="dist-label">{b.bucket}</span><div className="bar"><span style={{ width: `${(b.count / maxBucket) * 100}%` }} /><b>{b.count}</b></div></div>)}</div>
          <p className="muted small">Faculty by periods per week. Standard deviation {o.stdDev}: {o.stdDev > 5 ? "load is quite uneven" : o.stdDev > 3 ? "moderately uneven" : "fairly even"}.</p>
          <h3 style={{ marginTop: 16 }}>Year groups</h3>
          <div className="table-wrap"><table><thead><tr><th>Group</th><th>Classes/wk</th><th>Sections</th><th>Avg per section</th><th>Faculty</th></tr></thead>
            <tbody>{st.groups.map((g) => <tr key={g.group}><td><b>{g.group}</b></td><td>{g.classes}</td><td>{g.sections}</td><td>{g.avgPeriodsPerSection}</td><td>{g.faculty}</td></tr>)}</tbody></table></div>
        </div>
      </div>

      <div className="card">
        <h3>Busiest hours — classes running in each period</h3>
        <div className="table-wrap"><table className="heat">
          <thead><tr><th>Day</th>{st.heatmap[0].periods.map((p) => <th key={p.period}>P{p.period}</th>)}</tr></thead>
          <tbody>{st.heatmap.map((h) => <tr key={h.day}><td><b>{h.day}</b></td>{h.periods.map((p) => <td key={p.period} style={{ background: `color-mix(in srgb, var(--navy) ${Math.round((p.classes / maxHeat) * 70)}%, var(--card))`, color: p.classes / maxHeat > 0.5 ? "var(--on-navy)" : "var(--ink)" }}>{p.classes}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="muted small" style={{ marginTop: 8 }}>Darker = more parallel classes, so more rooms and faculty engaged at once. Light columns are where extra classes fit most easily.</p>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Faculty ({rows.length})</h3>
          <div className="row">
            <input type="search" placeholder="Search name or code…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
            <SearchSelect value={dept} onChange={setDept} width={200} placeholder="Department…" ariaLabel="Department" options={[{ value: "all", label: "All departments" }, ...st.departments.map((d) => ({ value: d.dept, label: d.dept, sub: `${d.faculty} faculty` }))]} />
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}><table>
          <thead><tr>{th("name", "Name")}{th("dept", "Dept")}{th("load", "Load/wk")}{th("lectures", "L")}{th("labs", "P")}{th("tutorials", "T")}{th("days", "Days")}{th("maxPerDay", "Max/day")}{th("longestRun", "Longest run")}{th("saturday", "Sat")}{th("courses", "Courses")}{th("sections", "Sections")}{th("vsAvg", "vs avg")}</tr></thead>
          <tbody>{rows.map((f) => <tr key={f.id}><td><b>{f.name}</b><div className="small muted">{f.id}</div></td><td className="small">{f.dept}</td><td><b>{f.load}</b></td><td>{f.lectures}</td><td>{f.labs}</td><td>{f.tutorials}</td><td>{f.days}</td><td>{f.maxPerDay}<span className="small muted"> {f.busiestDay !== "—" ? f.busiestDay : ""}</span></td><td>{f.longestRun}</td><td>{f.saturday}</td><td>{f.courses}</td><td>{f.sections}</td><td>{f.load ? vs(f.vsAvg) : <span className="pill light">none</span>}</td></tr>)}</tbody>
        </table></div>
        <p className="muted small" style={{ marginTop: 8 }}>Click a column heading to sort. “Longest run” is the most back-to-back periods in one day. L = lectures, P = labs, T = tutorials.</p>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="row between"><h3>Room utilisation</h3><select value={roomKind} onChange={(e) => setRoomKind(e.target.value)} style={{ width: "auto" }}><option value="all">All rooms</option><option>Classroom</option><option>Lab</option><option>Other</option></select></div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}><table><thead><tr><th>Room</th><th>Type</th><th>Used</th><th>Utilisation</th><th>Busiest</th></tr></thead>
            <tbody>{rooms.map((r) => <tr key={r.room}><td><b>{r.room}</b></td><td className="small">{r.kind}</td><td className="small">{r.used}/{r.capacity}</td><td style={{ minWidth: 140 }}><div className="bar"><span style={{ width: `${r.pct}%`, background: r.pct >= 80 ? "var(--bad)" : r.pct >= 60 ? "var(--warn)" : "var(--navy)" }} /><b>{r.pct}%</b></div></td><td className="small">{r.busiestDay}</td></tr>)}</tbody></table></div>
          <p className="muted small" style={{ marginTop: 8 }}>Capacity = teaching periods × 6 days. Rooms above 80% leave little room for make-up classes.</p>
        </div>
        <div className="card">
          <h3>Worth a look ({st.flags.length})</h3>
          {st.flags.length === 0 ? <p className="muted">Nothing unusual.</p> : <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}><table><thead><tr><th>Kind</th><th>Who</th><th>Detail</th></tr></thead>
            <tbody>{st.flags.map((f, i) => <tr key={i}><td><span className={`pill ${/High|Heavy|Long|Unassigned/.test(f.kind) ? "warn" : "info"}`}>{f.kind}</span></td><td>{f.who}</td><td className="small">{f.detail}</td></tr>)}</tbody></table></div>}
          <p className="muted small" style={{ marginTop: 8 }}>High / light = 50% or more above / below the university average. Heavy day = 6+ periods in one day. Long run = 5+ consecutive periods.</p>
        </div>
      </div>
    </>
  );
}
