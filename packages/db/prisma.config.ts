import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Load the repo-root .env (when present) so every workspace shares one config file. Values already
// in the environment (Vercel, Docker, CI) win. Node's built-in loader, so builds that install
// without dev dependencies (Vercel) need no extra package.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Placeholder lets `prisma generate` run without a database (e.g. in CI).
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
