import { Admin } from "@/components/Admin";
import { spaceById } from "@/lib/space";

export const metadata = { title: "Admin (Jul–Dec 2026) — JUIT Timetable" };
export const dynamic = "force-dynamic";

export default function AdminPage() { const s = spaceById("2026"); return <Admin base={s.portal} spaceLabel={s.label} />; }
