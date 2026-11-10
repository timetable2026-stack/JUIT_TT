// Public address and names used in every email link and the calendar feed.
// NEXT_PUBLIC_SITE_URL wins when set; otherwise Vercel's own production URL is used,
// so links are right from the first deploy without any configuration.
export function siteConfig() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelThis = process.env.VERCEL_URL?.trim();
  const url = (explicit && explicit !== "http://localhost:3000" ? explicit : vercelProd ? `https://${vercelProd}` : vercelThis ? `https://${vercelThis}` : "http://localhost:3000").replace(/\/$/, "");
  return {
    url,
    department: process.env.NEXT_PUBLIC_DEPARTMENT_NAME || "Time Table Committee (TTC)",
    institute: process.env.NEXT_PUBLIC_INSTITUTE_NAME || "Jaypee University of Information Technology, Solan",
    office: "Time Table Committee",
  };
}
