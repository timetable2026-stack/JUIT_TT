"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const KEY = "tt_theme";

/** Applies the chosen theme to <html>. "system" removes the attribute so prefers-color-scheme decides. */
export function applyTheme(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => { try { const m = localStorage.getItem(KEY) as Mode | null; if (m === "light" || m === "dark") setMode(m); } catch {} }, []);
  const pick = (m: Mode) => { setMode(m); applyTheme(m); try { m === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, m); } catch {} };
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {(["system", "light", "dark"] as Mode[]).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)} title={m === "system" ? "Follow device setting" : `${m[0].toUpperCase()}${m.slice(1)} mode`}>{m === "system" ? "Auto" : m === "light" ? "Light" : "Dark"}</button>)}
    </div>
  );
}

/** Inline script for <head>: sets data-theme before first paint so there is no flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem("${KEY}");if(m==="light"||m==="dark"){document.documentElement.setAttribute("data-theme",m);}}catch(e){}})();`;
