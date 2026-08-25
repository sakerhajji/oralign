import type { MetadataRoute } from "next";

/**
 * /manifest.webmanifest — auto-linked by Next from every page. Gives
 * browsers and crawlers the canonical app identity (name + icons),
 * which also feeds the icon some search surfaces display next to the
 * site name.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ORALIGN — Aligneurs dentaires invisibles",
    short_name: "ORALIGN",
    description:
      "Aligneurs dentaires invisibles conçus en Allemagne et fabriqués en Tunisie, supervisés par des praticiens certifiés.",
    start_url: "/decouvrir",
    display: "browser",
    background_color: "#0a0a0a",
    theme_color: "#feca16",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
