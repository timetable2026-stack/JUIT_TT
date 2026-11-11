import { ImageResponse } from "next/og";
export const runtime = "nodejs";
export const alt = "JUIT Timetable — Time Table Committee";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#16293f 0%,#1f3a5f 100%)", color: "#fff", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ width: 88, height: 88, borderRadius: 22, background: "#fff", color: "#16293f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>TT</div>
        <div style={{ fontSize: 30, opacity: 0.9 }}>Time Table Committee · Jaypee University of Information Technology, Solan</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>JUIT Timetable</div>
        <div style={{ fontSize: 36, opacity: 0.92 }}>Faculty, section and room timetables — always the current version</div>
      </div>
      <div style={{ display: "flex", gap: 18, fontSize: 26, opacity: 0.85 }}><span>Change alerts</span><span>·</span><span>Daily reminders</span><span>·</span><span>Excel download</span><span>·</span><span>Calendar feed</span></div>
    </div>,
    size,
  );
}
