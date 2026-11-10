import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "JUIT Timetable — TTC",
  description: "Semester timetable portal: one link for every faculty member, always current.",
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#1f3a5f" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
