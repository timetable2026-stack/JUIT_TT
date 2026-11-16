// "Spaces": fully separate copies of the whole system (own timetable, versions,
// alerts, reminders, preferences, settings and admin) served from the same site.
// The default space is the original one and is untouched: same tables, same URLs.
// Every other space keeps its data in its own tables (suffix) and lives under
// its own portal and admin paths; its API is reached at <portal>/api/... which
// middleware rewrites to /api/... with the space in a header.
import { siteConfig } from "./site";

export interface Space {
  id: string;      // "" for the original system
  suffix: string;  // table / file suffix, e.g. "_2026"
  portal: string;  // portal path, "" (home) or "/2026"
  admin: string;   // admin path
  label: string;   // shown in the admin header
}

export const SPACES: Space[] = [
  { id: "", suffix: "", portal: "", admin: "/admin", label: "Jan–Jun 2027" },
  { id: "2026", suffix: "_2026", portal: "/2026", admin: "/2026_admin", label: "Jul–Dec 2026 (current semester)" },
];
export const DEFAULT_SPACE = SPACES[0];
export const SPACE_HEADER = "x-tt-space";

export function spaceById(id: string | null | undefined): Space {
  return SPACES.find((s) => s.id === (id ?? "")) ?? DEFAULT_SPACE;
}

/** The space an API request belongs to: set by middleware for <portal>/api/..., or ?space= for direct calls. */
export function spaceOf(req: Request): Space {
  const fromHeader = req.headers.get(SPACE_HEADER);
  if (fromHeader) return spaceById(fromHeader);
  try { return spaceById(new URL(req.url).searchParams.get("space")); } catch { return DEFAULT_SPACE; }
}

/** The portal's absolute URL for links in emails and calendar feeds. */
export function siteUrlFor(space: Space): string {
  return `${siteConfig().url.replace(/\/$/, "")}${space.portal}`;
}
