import type { MetadataRoute } from "next";
import { APARTMENT_NAME, APARTMENT_SHORT_NAME } from "@/lib/config";

/** Web app manifest (served at /manifest.webmanifest) so the app can be installed. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APARTMENT_NAME,
    short_name: APARTMENT_SHORT_NAME,
    description: "Monthly maintenance, expenses, notices and apartment rules",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f4f9",
    theme_color: "#1e3a8a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
