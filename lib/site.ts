export function siteConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    department: process.env.NEXT_PUBLIC_DEPARTMENT_NAME || "Department of Computer Science & Engineering",
    institute: process.env.NEXT_PUBLIC_INSTITUTE_NAME || "Jaypee University of Information Technology, Solan",
  };
}
