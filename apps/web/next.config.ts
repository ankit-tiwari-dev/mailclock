import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import type { NextConfig } from "next";

// One .env at the repo root configures every workspace. Values already in the
// environment (Vercel, Docker) take precedence.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@mailclock/core", "@mailclock/db"],
  poweredByHeader: false,
};

export default nextConfig;
