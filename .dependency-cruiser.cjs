/**
 * Dependency-cruiser — encodes the locked layering rules (PROJECT_STRUCTURE.md §2,
 * PROVIDER_ARCHITECTURE.md). The package graph is: schema ← core ← cli.
 *
 * - schema depends on nothing internal (it is the contract).
 * - core (the provider-blind normalization→policy→report core) must never depend on the cli.
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
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^packages/(schema|core|cli)/src',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
