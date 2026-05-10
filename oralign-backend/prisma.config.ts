import { defineConfig } from "prisma/config";

// Load .env for local development; in Docker DATABASE_URL is injected via env.
// Wrapped in try/catch so the production image (no dotenv) works without changes.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch {
  // dotenv not installed (production) — env vars come from the container runtime
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
