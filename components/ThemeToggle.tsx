"use client";
import { useEffect, useRef, useState } from "react";

type Mode = "system" | "light" | "dark";
const KEY = "tt_theme";
const IDLE_MS = 3000;

/** Applies the chosen theme to <html>. "system" removes the attribute so prefers-color-scheme decides. */
export function applyTheme(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
}

const Sun = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
const Moon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
const Auto = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></svg>;

/**
 * Floating theme control: a round button in the bottom-right corner that fades
 * away after a few seconds without any pointer, touch, scroll or key activity,
 * and comes back on the next movement. Tap it to choose Auto / Light / Dark.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  const [open, setOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [dark, setDark] = useState(false);
  const timer = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const m = localStorage.getItem(KEY) as Mode | null; if (m === "light" || m === "dark") setMode(m); } catch {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && mq.matches));
    sync(); mq.addEventListener("change", sync);
    const obs = new MutationObserver(sync); obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const arm = () => { setIdle(false); if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setIdle(true), IDLE_MS); };
    const events: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "touchstart", "scroll", "keydown", "wheel"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    const away = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => { events.forEach((e) => window.removeEventListener(e, arm)); window.removeEventListener("pointerdown", away); mq.removeEventListener("change", sync); obs.disconnect(); if (timer.current) window.clearTimeout(timer.current); };
  }, []);

  const pick = (m: Mode) => { setMode(m); applyTheme(m); try { m === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, m); } catch {} setOpen(false); };
  const label = mode === "system" ? "Theme: automatic" : mode === "light" ? "Theme: light" : "Theme: dark";

  return (
    <div ref={wrap} className={`theme-fab ${idle && !open ? "idle" : ""} ${open ? "open" : ""}`} onFocusCapture={() => setIdle(false)}>
      {open && (
        <div className="theme-menu" role="group" aria-label="Colour theme">
          {([["system", "Auto", <Auto key="a" />], ["light", "Light", <Sun key="l" />], ["dark", "Dark", <Moon key="d" />]] as [Mode, string, React.ReactNode][]).map(([m, text, icon]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}>{icon}<span>{text}</span></button>
          ))}
        </div>
      )}
      <button type="button" className="theme-fab-btn" aria-label={label} aria-expanded={open} title={label} onClick={() => { setOpen((o) => !o); setIdle(false); }}>
        {mode === "system" ? <Auto /> : dark ? <Moon /> : <Sun />}
      </button>
    </div>
  );
}

/** Inline script for <head>: sets data-theme before first paint so there is no flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("${KEY}");if(m==="light"||m==="dark"){document.documentElement.setAttribute("data-theme",m);}}catch(e){}})();`;
