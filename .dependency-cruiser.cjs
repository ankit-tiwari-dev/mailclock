/**
 * Architecture rules for Mailclock (see CONSTRAINTS.md → "Architecture").
 * Run: npm run check:arch
 * Known violations that predate a rule live in .dependency-cruiser-known-violations.json
 * (a ratchet: they may shrink, never grow). Regenerate it only when one is fixed.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Cycles make modules impossible to understand or test in isolation.",
      from: { path: "^(apps|packages)/" },
      to: { circular: true },
    },
    {
      name: "packages-not-to-apps",
      severity: "error",
      comment: "packages/* are shared by every app; they may never depend on an app.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-independent",
      severity: "error",
      comment: "web and worker deploy separately; shared logic belongs in packages/core.",
      from: { path: "^apps/(web|worker)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "db-only-depends-on-prisma",
      severity: "error",
      comment: "packages/db is the persistence leaf; it must not know about domain logic.",
      from: { path: "^packages/db/" },
      to: { path: "^packages/core/" },
    },
    {
      name: "web-ui-not-to-db",
      severity: "error",
      comment:
        "Pages and components go through packages/core for data, so project scoping and lifecycle rules have one home. Type-only imports are allowed.",
      from: { path: "^apps/web/src/(app/(?!api/)|components/)" },
      to: { path: "^packages/db/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "client-not-to-server-only",
      severity: "error",
      comment: "Client components must not import server modules (DB client, secrets, auth server).",
      from: { path: "^apps/web/src/components/" },
      to: { path: "^(packages/(db|core)/src/(index|crypto|api-keys)|apps/web/src/lib/(auth|session|api|mcp))\\.ts$", dependencyTypesNot: ["type-only"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(node_modules|\\.next|/generated/|/coverage/|\\.test\\.ts$)" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "apps/web/tsconfig.json" },
    combinedDependencies: true,
    preserveSymlinks: false,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"], extensions: [".ts", ".tsx", ".js", ".mjs"] },
  },
};
