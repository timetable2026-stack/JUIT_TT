import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JUIT Timetable", short_name: "JUIT TT", description: "Class timetable of JUIT Solan, published by the Time Table Committee.",
    start_url: "/", display: "standalone", background_color: "#f4f6f9", theme_color: "#16293f", lang: "en-IN", categories: ["education"],
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
