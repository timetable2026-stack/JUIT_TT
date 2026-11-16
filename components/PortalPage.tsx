import { Portal } from "./Portal";
import { SplashScreen } from "./SplashScreen";
import { getPublicPayload } from "@/lib/publicPayload";
import { allSections, allRooms } from "@/lib/exportGrid";
import { DEFAULT_SPACE, type Space } from "@/lib/space";

// The page is rendered on the server with the live data, so the first paint is
// complete (no "Loading…" flash) and search engines index real content.
export async function PortalPage({ space = DEFAULT_SPACE }: { space?: Space } = {}) {
  let payload: Awaited<ReturnType<typeof getPublicPayload>> | null = null;
  let setupError: string | null = null;
  try { payload = await getPublicPayload(space); } catch (e: any) { setupError = String(e?.message ?? e); }
  if (!payload) {
    // An extra copy whose tables are not created yet (or a database hiccup): say so instead of failing the build.
    const missing = /does not exist|relation|schema cache/i.test(setupError ?? "");
    return (
      <main id="main"><div className="container"><div className="card empty" style={{ marginTop: 32 }}>
        <div className="empty-art">🛠️</div>
        <h2>{missing && space.id ? "This copy is not set up yet" : "The timetable is temporarily unavailable"}</h2>
        <p className="muted">{missing && space.id
          ? <>Run <code>supabase/schema{space.suffix}.sql</code> once in Supabase → SQL editor, then open the admin and publish the timetable. The original site is not affected.</>
          : "Please try again in a minute."}</p>
        <p className="muted small" style={{ wordBreak: "break-word" }}>{setupError}</p>
        <a className="btn" href={space.admin}>TTC sign-in</a>
      </div></div></main>
    );
  }
  const d = payload.data;
  const sem = d?.semesters[0];
  const fmt = (iso?: string) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");
  return (
    <>
      <SplashScreen />
      <section className="seo-intro" aria-label="About this timetable">
        <h1>JUIT Timetable — Time Table Committee{space.id ? ` (${space.label})` : ""}</h1>
        <p>
          {d && sem
            ? `Class timetable of Jaypee University of Information Technology, Solan for ${fmt(sem.startDate)} to ${fmt(sem.endDate)}: ${d.slots.length.toLocaleString("en-IN")} classes across ${d.semesters.map((s) => s.name).join(", ")}, ${d.faculty.length} faculty, ${allSections(d).length} sections and ${allRooms(d).length} rooms. Version ${payload.version?.id}, published by the Time Table Committee.`
            : "Official class timetable of Jaypee University of Information Technology, Solan, published by the Time Table Committee. The current semester's timetable will appear here as soon as it is published."}
        </p>
      </section>
      <main id="main">
        <Portal initial={payload} base={space.portal} adminPath={space.admin} />
      </main>
    </>
  );
}
