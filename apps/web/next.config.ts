import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@mailclock/core", "@mailclock/db"],
  poweredByHeader: false,
};

export default nextConfig;
