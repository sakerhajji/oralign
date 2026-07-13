import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Bundle only required files for the Docker image (drops image from ~1.4GB to ~250MB)
  output: "standalone",
  // Backend origins allowed to serve next/image sources from /uploads.
  // Present for when next/image optimization is enabled against the API
  // host; the dashboard slider currently renders pre-resized variants
  // with `unoptimized`.
  images: {
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
  // The practitioner marketing showcase was removed; the public site is the
  // patient website served at "/". Old practitioner URLs redirect to the
  // most relevant surviving destination (specific rules before the catch-all).
  async redirects() {
    return [
      // Patient home now lives at "/" (the audience chooser is gone).
      { source: "/patient", destination: "/", permanent: true },
      // The practitioner blog merged into the single public blog.
      {
        source: "/practitioner/blog/:slug",
        destination: "/patient/blog/:slug",
        permanent: true,
      },
      { source: "/practitioner/blog", destination: "/patient/blog", permanent: true },
      // Any remaining practitioner marketing URL → the secured platform sign-in.
      { source: "/practitioner/:path*", destination: "/login", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source:
          "/:path*\\.(webp|png|jpg|jpeg|gif|svg|ico|avif|woff|woff2)",
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
