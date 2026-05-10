import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Bundle only required files for the Docker image (drops image from ~1.4GB to ~250MB)
  output: "standalone",
  // Keep Turbopack module resolution anchored to this app directory.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
