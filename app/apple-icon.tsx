import { ImageResponse } from "next/og";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#16293f", color: "#fff", fontSize: 80, fontWeight: 800, letterSpacing: -4, fontFamily: "Arial" }}>TT</div>,
    size,
  );
}
