"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchOption { value: string; label: string; sub?: string; group?: string }

/**
 * A dropdown you can type into. Opens on click or focus, filters as you type
 * (label, sub-text and value), supports arrow keys / Enter / Escape, keeps
 * option groups, and closes on outside click. Falls back gracefully to the
 * current label when closed.
 */
export function SearchSelect({ id, value, options, onChange, placeholder = "Type to search…", width = 260, ariaLabel }: {
  id?: string; value: string; options: SearchOption[]; onChange: (v: string) => void; placeholder?: string; width?: number | string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const l = q.trim().toLowerCase();
    if (!l) return options;
    const words = l.split(/\s+/);
    return options.filter((o) => { const hay = `${o.label} ${o.sub ?? ""} ${o.value} ${o.group ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
  }, [options, q]);
  const grouped = useMemo(() => {
    const m = new Map<string, SearchOption[]>();
    for (const o of filtered) m.set(o.group ?? "", [...(m.get(o.group ?? "") ?? []), o]);
    return [...m];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`); el?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const close = () => { setOpen(false); setQ(""); };
  const choose = (v: string) => { onChange(v); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); e.preventDefault(); return; }
    if (e.key === "ArrowDown") { setActive((a) => Math.min(filtered.length - 1, a + 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
    else if (e.key === "Enter") { if (filtered[active]) choose(filtered[active].value); e.preventDefault(); }
    else if (e.key === "Escape") { close(); input.current?.blur(); }
  };
  let i = -1;

  return (
    <div ref={wrap} className={`sselect ${open ? "open" : ""}`} style={{ width }}>
      <input
        ref={input} id={id} type="text" role="combobox" aria-expanded={open} aria-autocomplete="list" aria-label={ariaLabel ?? placeholder} aria-controls={id ? `${id}-list` : undefined}
        className="sselect-input" value={open ? q : current?.label ?? ""} placeholder={open ? placeholder : current ? current.label : placeholder}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); if (!open) setOpen(true); }} onKeyDown={onKey} autoComplete="off" spellCheck={false}
      />
      {current?.sub && !open && <span className="sselect-sub">{current.sub}</span>}
      <span className="sselect-caret" aria-hidden="true">▾</span>
      {open && (
        <div ref={list} id={id ? `${id}-list` : undefined} className="sselect-list" role="listbox">
          {filtered.length === 0 && <div className="sselect-empty">No match for “{q}”</div>}
          {grouped.map(([g, opts]) => (
            <div key={g}>
              {g && <div className="sselect-group">{g}</div>}
              {opts.map((o) => { i++; const idx = i; return (
                <div key={o.value} data-i={idx} role="option" aria-selected={o.value === value} className={`sselect-opt ${idx === active ? "active" : ""} ${o.value === value ? "selected" : ""}`} onMouseEnter={() => setActive(idx)} onPointerDown={(e) => { e.preventDefault(); choose(o.value); }}>
                  <span>{o.label}</span>{o.sub && <small>{o.sub}</small>}
                </div>
              ); })}
            </div>
          ))}
          <div className="sselect-foot">{filtered.length} of {options.length}</div>
        </div>
      )}
    </div>
  );
}
