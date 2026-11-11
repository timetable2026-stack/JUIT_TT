/** Shown while the timetable loads: the brand mark with a soft pulse and a shimmering week grid. */
export function LoadingScreen({ message = "Loading the current timetable…" }: { message?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={message}>
      <div className="loading-mark"><span>TT</span></div>
      <div className="loading-title">JUIT Timetable</div>
      <div className="loading-sub">{message}</div>
      <div className="loading-grid" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <span key={i} style={{ animationDelay: `${(i % 6) * 90 + Math.floor(i / 6) * 60}ms` }} />)}
      </div>
    </div>
  );
}
