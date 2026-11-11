"use client";
// Opening screen of the public portal: painted by the server so it is the very
// first thing a visitor sees, then fades away as soon as the page is ready
// (after a short minimum so it never just flickers). Shown once per browser tab.
import { useEffect, useState } from "react";
import { LoadingScreen } from "./LoadingScreen";

const KEY = "tt_splash_seen";
const MIN_MS = 900;

export function SplashScreen({ message = "Opening the timetable…" }: { message?: string }) {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; sessionStorage.setItem(KEY, "1"); } catch {}
    if (seen) { setPhase("gone"); return; }
    const t1 = setTimeout(() => setPhase("fade"), MIN_MS);
    const t2 = setTimeout(() => setPhase("gone"), MIN_MS + 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (phase === "gone") return null;
  return (
    <div className={`splash ${phase === "fade" ? "splash-out" : ""}`} aria-hidden={phase === "fade"}>
      <LoadingScreen message={message} />
      <div className="splash-foot">Jaypee University of Information Technology · Time Table Committee</div>
    </div>
  );
}
