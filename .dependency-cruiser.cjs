/**
 * Dependency-cruiser — encodes the locked layering rules (PROJECT_STRUCTURE.md §2,
 * PROVIDER_ARCHITECTURE.md, ADR-006, ADR-007). The graph is:
 *
 *   schema ← core ← cli
 *   schema ← apps/web            (apps/web is the application layer, ADR-007)
 *
 * - schema depends on nothing internal (it is the contract).
 * - core (the provider-blind normalization→policy→report core) must never depend on the cli.
 * - apps/web may depend on @shipready/schema only. @shipready/core is deliberately NOT allowed
 *   yet (ADR-007): until a narrow @shipready/sdk boundary exists, the application layer has no
 *   sanctioned way to reach core's internals, by design.
 * - apps/web is never imported by packages/(schema|core|cli) — it is a leaf, not a dependency.
 * - no consumer may reach past core's public barrel (index.ts) into its internals — this is
 *   what protects future provider/policy/scanner internals (ADR-007) without a rule needed per
 *   subdirectory as core grows.
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
      name: 'web-may-not-import-core',
      comment:
        "ADR-007: apps/web's allowed internal dependency is @shipready/schema only. " +
        '@shipready/core is off-limits until a dedicated @shipready/sdk boundary exists.',
      severity: 'error',
      from: { path: '^apps/web' },
      to: { path: '^packages/core/src' },
    },
    {
      name: 'web-may-not-import-cli',
      comment: 'cli is a leaf orchestration entrypoint; nothing else may depend on it.',
      severity: 'error',
      from: { path: '^apps/web' },
      to: { path: '^packages/cli/src' },
    },
    {
      name: 'respect-core-barrel',
      comment:
        'No consumer outside packages/core/src may import a file inside it other than its ' +
        'index.ts entry point (ADR-007). This is the mechanism that will protect future ' +
        'provider/policy/scanner internals as core grows, without needing a new rule per ' +
        'subdirectory.',
      severity: 'error',
      from: { pathNot: '^packages/core/src' },
      to: { path: '^packages/core/src/(?!index\\.ts$).+' },
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
