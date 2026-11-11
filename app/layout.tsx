import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_BOOT_SCRIPT } from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/site";
import "./globals.css";

const site = siteConfig();
const title = "JUIT Timetable";
const description = "Official class timetable of Jaypee University of Information Technology (JUIT), Solan, published by the Time Table Committee: faculty, section and room timetables for the current semester, with change alerts and daily reminders.";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${title} — Time Table Committee, JUIT Solan`, template: `%s · ${title}` },
  description,
  applicationName: title,
  keywords: ["JUIT timetable", "JUIT Solan timetable", "Jaypee University of Information Technology timetable", "JUIT class schedule", "JUIT faculty timetable", "JUIT Waknaghat timetable", "Time Table Committee JUIT", "JUIT TTC", "JUIT section timetable", "JUIT room timetable"],
  authors: [{ name: "Time Table Committee, JUIT Solan" }],
  creator: "Time Table Committee, JUIT",
  publisher: "Jaypee University of Information Technology, Solan",
  category: "education",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", locale: "en_IN", url: site.url, siteName: title,
    title: `${title} — current semester, always up to date`,
    description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "JUIT Timetable — Time Table Committee" }],
  },
  twitter: { card: "summary_large_image", title: `${title} — Time Table Committee, JUIT Solan`, description, images: ["/opengraph-image"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon", type: "image/png", sizes: "512x512" }], apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#16293f" }, { media: "(prefers-color-scheme: dark)", color: "#0e1420" }],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "EducationalOrganization", "@id": `${site.url}/#org`, name: "Jaypee University of Information Technology", alternateName: ["JUIT", "JUIT Solan", "JUIT Waknaghat"], url: "https://www.juit.ac.in", address: { "@type": "PostalAddress", addressLocality: "Waknaghat, Solan", addressRegion: "Himachal Pradesh", postalCode: "173234", addressCountry: "IN" } },
    { "@type": "WebSite", "@id": `${site.url}/#website`, url: site.url, name: title, description, publisher: { "@id": `${site.url}/#org` }, inLanguage: "en-IN" },
    { "@type": "WebApplication", "@id": `${site.url}/#app`, name: title, url: site.url, applicationCategory: "EducationalApplication", operatingSystem: "Any", browserRequirements: "Requires JavaScript", offers: { "@type": "Offer", price: "0", priceCurrency: "INR" }, provider: { "@type": "Organization", name: "Time Table Committee, JUIT", parentOrganization: { "@id": `${site.url}/#org` } }, featureList: ["Faculty timetable", "Section timetable", "Room timetable", "Change alerts", "Daily class reminders", "Excel download", "Calendar subscription"] },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
