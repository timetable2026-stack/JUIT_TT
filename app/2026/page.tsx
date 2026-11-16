import { PortalPage } from "@/components/PortalPage";
import { spaceById } from "@/lib/space";

// The current semester (Jul–Dec 2026): a separate copy of the portal with its own data.
export const revalidate = 60;
export const metadata = { title: "JUIT Timetable — Jul–Dec 2026", alternates: { canonical: "/2026" } };

export default function Page() { return <PortalPage space={spaceById("2026")} />; }
