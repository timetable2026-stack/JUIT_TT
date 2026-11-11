import { Portal } from "@/components/Portal";
import { getPublicPayload } from "@/lib/publicPayload";
import { allSections, allRooms } from "@/lib/exportGrid";

// Served from cache and rebuilt in the background; a publish or announcement revalidates it at once.
export const revalidate = 60;

// The page is rendered on the server with the live data, so the first paint is
// complete (no "Loading…" flash) and search engines index real content.
export default async function Page() {
  const payload = await getPublicPayload();
  const d = payload.data;
  const sem = d?.semesters[0];
  const fmt = (iso?: string) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");
  return (
    <>
      <section className="seo-intro" aria-label="About this timetable">
        <h1>JUIT Timetable — Time Table Committee</h1>
        <p>
          {d && sem
            ? `Class timetable of Jaypee University of Information Technology, Solan for ${fmt(sem.startDate)} to ${fmt(sem.endDate)}: ${d.slots.length.toLocaleString("en-IN")} classes across ${d.semesters.map((s) => s.name).join(", ")}, ${d.faculty.length} faculty, ${allSections(d).length} sections and ${allRooms(d).length} rooms. Version ${payload.version?.id}, published by the Time Table Committee.`
            : "Official class timetable of Jaypee University of Information Technology, Solan, published by the Time Table Committee. The current semester's timetable will appear here as soon as it is published."}
        </p>
      </section>
      <main id="main">
        <Portal initial={payload} />
      </main>
    </>
  );
}
