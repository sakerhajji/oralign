import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the API lives, as seen from THIS server: the in-cluster address when
 * the container has one (API_INTERNAL_URL), the public one otherwise. Read
 * at build time — rewrites are baked into the standalone server.
 */
const API_ORIGIN = (
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000/api"
)
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

const nextConfig: NextConfig = {
  // Bundle only required files for the Docker image (drops image from ~1.4GB to ~250MB)
  output: "standalone",
  // Backend origins allowed to serve next/image sources from /uploads.
  // Present for when next/image optimization is enabled against the API
  // host; the dashboard slider currently renders pre-resized variants
  // with `unoptimized`.
  images: {
    qualities: [75, 85],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "api.oralign.com.tn",
        pathname: "/uploads/**",
      },
    ],
  },
  // Uploaded files (practitioner photos, clinic logos) are served by the API
  // origin. The site proxies them under its own /uploads so pages can draw
  // them as same-origin paths — which lets next/image resize them: the
  // optimizer refuses a remote host that resolves to a private address
  // (Docker's), and a practitioner's photo is a full-size upload that no
  // phone should decode for a 44 px circle.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` }];
  },
  // The practitioner marketing showcase was removed; the public site is the
  // patient website served at "/". Old practitioner URLs redirect to the
  // most relevant surviving destination (specific rules before the catch-all).
  async redirects() {
    return [
      // The homepage moved from /decouvrir to the site root, and the
      // localized homes from /<lang>/discover to /<lang>. One 308 each,
      // so bookmarks and anything already crawled consolidate onto the
      // canonical home instead of dead-ending.
      { source: "/decouvrir", destination: "/", permanent: true },
      { source: "/en/discover", destination: "/en", permanent: true },
      { source: "/ar/discover", destination: "/ar", permanent: true },
      // Patient home now lives at "/" (the audience chooser is gone).
      { source: "/patient", destination: "/", permanent: true },
      // The whole /patient/* subtree was flattened to top-level routes
      // (/patient/cas -> /cas, /patient/blog -> /blog, and so on). One
      // catch-all keeps every old patient URL — blog included — reachable.
      { source: "/patient/:path*", destination: "/:path*", permanent: true },
      // The old practitioner blog merged into the same public blog.
      {
        source: "/practitioner/blog/:slug",
        destination: "/blog/:slug",
        permanent: true,
      },
      { source: "/practitioner/blog", destination: "/blog", permanent: true },
      // Any remaining practitioner marketing URL → the secured platform sign-in.
      { source: "/practitioner/:path*", destination: "/login", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // The social card is RENDERED (app/og.png/route.tsx) under a fixed
        // name, so it must not fall under the immutable rule below: a
        // redesign would otherwise never reach browsers and CDNs that
        // cached it. A day is plenty for a card.
        source: "/og.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        // A year, immutable: a file under public/ must therefore change its
        // NAME when its content changes (loginPicture.<hash>.webp, the hero
        // film's oralign-film-*.<hash>.mp4), or returning visitors keep the
        // old copy for that year.
        source:
          "/:path*\\.(webp|png|jpg|jpeg|gif|svg|ico|avif|woff|woff2|mp4)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  // Keep Turbopack module resolution anchored to this app directory.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
