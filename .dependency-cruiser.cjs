/**
 * Dependency-cruiser — encodes the locked layering rules (PROJECT_STRUCTURE.md §2,
 * PROVIDER_ARCHITECTURE.md). The package graph is: schema ← core ← cli, with apps/web as an
 * additional leaf consumer (SPRINTS.md S9+: apps/web is where server-side policy evaluation
 * eventually runs, so it may depend on schema/core; nothing may depend on apps/web).
 *
 * - schema depends on nothing internal (it is the contract).
 * - core (the provider-blind normalization→policy→report core) must never depend on the cli.
 * - apps/web is never imported by packages/(schema|core|cli) — it is a leaf, not a dependency.
 * - no circular dependencies anywhere.
 *
 * Cross-package imports (`@shipready/*`) resolve to each package's `src` via the tsconfig
 * `paths` in packages/config-tsconfig/base.json, so this runs pre-build.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'schema-is-the-contract',
      comment: 'schema must not depend on any other @shipready package.',
      severity: 'error',
      from: { path: '^packages/schema/src' },
      to: { path: '^packages/(core|cli)/src' },
    },
    {
      name: 'core-never-imports-cli',
      comment: 'The provider-blind core must never depend on the CLI.',
      severity: 'error',
      from: { path: '^packages/core/src' },
      to: { path: '^packages/cli/src' },
    },
    {
      name: 'packages-never-import-apps-web',
      comment:
        'apps/web is a leaf consumer of the package graph (ADR-006 charters schema/core/cli/' +
        'config-tsconfig only). No package may depend back on it.',
      severity: 'error',
      from: { path: '^packages/(schema|core|cli)/src' },
      to: { path: '^apps/web' },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^(packages/(schema|core|cli)/src|apps/web/app)',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
