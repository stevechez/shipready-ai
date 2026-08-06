# STACK.md — ShipReady AI

Principle for every choice: **prefer boring, well-supported technology at the verdict-critical core, and
prefer platform-native integrations at the edges.** The engine must be dependency-light and auditable;
the web app can lean on the Vercel/Supabase ecosystem.

## Monorepo & tooling

| Choice | Alternatives considered | Why chosen |
|---|---|---|
| **pnpm workspaces + Turborepo** | npm/yarn workspaces; Nx | pnpm's strict, content-addressed store prevents phantom deps — fitting for a product that *audits* dependency hygiene. Turborepo gives cached task graphs and is first-party to our deploy target (Vercel). Nx is heavier than we need. |
| **TypeScript (strict)** | JS + JSDoc | The product's credibility rests on type-safe boundaries; `strict` + `noUncheckedIndexedAccess` everywhere. |
| **Vitest** | Jest | Faster, ESM-native, same API surface; the engine is heavily unit-tested and test speed matters. |
| **tsup** (build CLI/engine libs) | tsc-only, unbuild | Fast esbuild-based bundling with `.d.ts`, dual ESM/CJS for the published CLI. |
| **Biome** (lint+format) | ESLint + Prettier | Single fast binary, less config surface. (ESLint acceptable if a needed rule is missing — decide in Sprint 0.) |
| **Changesets** | manual versioning | Independent semver for published `@shipready/*` packages, with a changelog. |

## The engine (verdict-critical — keep dependencies minimal & vetted)

| Choice | Alternatives | Why |
|---|---|---|
| **TypeScript Compiler API (`typescript`)** for AST | `ts-morph`, `@babel/parser`, `swc` | We already depend on `typescript` to detect versions and (via the user's own tsc) to check compilation. The raw compiler API is verbose but has zero extra supply-chain surface and exact fidelity. `ts-morph` is a nicer wrapper we may add as a thin internal helper, but the primitive is the compiler API. |
| **`@supabase/*` migration SQL parsed with `pgsql-ast-parser`** | regex; `libpg-query` (native) | RLS/migration analysis needs real SQL parsing, not regex. `pgsql-ast-parser` is pure-JS (no native build, works everywhere `npx` runs). `libpg-query` is more accurate but ships a native binary — rejected for portability. We degrade gracefully to a conservative regex pre-pass only to *locate* SQL. |
| **Lockfile parsing:** `@pnpm/lockfile-file`, `@yarnpkg/lockfile`, native `package-lock.json` JSON | walk `node_modules` | Parse the lockfile (declarative, deterministic) rather than the installed tree. Supports the three major managers. |
| **`ignore`** (gitignore matching) | custom | Tiny, correct `.gitignore` semantics for the file walker. |
| **`picocolors` / `zod`** | chalk / yup | Minimal, fast, ubiquitous. Zod is shared with the schema package. |
| **No runtime execution of target code** | sandbox libs | Deliberately excluded in V1 (see MVP_SCOPE). The one exception — running the user's own `tsc` — is spawned as their process, in their env, by explicit consent. |

Rule of thumb: **the engine's `dependencies` list is itself audited** and kept short. Every dep we add is
a dep we'd flag in someone else's project.

## Web application

| Layer | Choice | Alternatives | Why |
|---|---|---|---|
| Framework | **Next.js App Router** | Remix, plain React SPA | Server Components + Route Handlers give us one codebase for UI + API; first-party on Vercel; streaming AI responses on the Node runtime (no Edge needed). |
| Hosting | **Vercel (Fluid Compute, Node runtime)** | self-host, Cloud Run | Fluid Compute reuses instances (fewer cold starts), 300s default timeout covers report/PDF jobs, native AI Gateway. **We avoid `runtime='edge'`** — streaming works on Node and we want full Node APIs. |
| Styling | **Tailwind CSS** | CSS Modules, vanilla-extract | Velocity + consistency; pairs with shadcn/ui. |
| Components | **shadcn/ui (Radix primitives)** | MUI, Chakra | Own-the-code model (no black-box dep), accessible Radix under the hood, themeable — matches our "no bloat" ethos. |
| Data/Auth/Storage | **Supabase (Postgres, Auth, Storage, RLS)** | Neon + Clerk + S3; raw Postgres | RLS is the spine of our multi-tenancy *and* it's a subject we audit — dogfooding matters. One vendor for auth+db+storage reduces surface. See AUTH.md for the RLS strategy. |
| DB access | **`@supabase/supabase-js` + `postgres` (server, for service tasks)** | Prisma, Drizzle | Supabase client for RLS-scoped access from the app. For migrations/typed queries we use **Drizzle** as the schema-as-code + migration tool (typed, SQL-first, no heavy runtime). *Decision:* Drizzle for schema/migrations/types; Supabase client for RLS-enforced request-time reads. |
| Validation | **Zod** | valibot, yup | Shared client/server/CLI; single schema source; great TS inference. Valibot is lighter but Zod's ecosystem (and AI SDK integration) wins. |
| AI | **Vercel AI SDK + AI Gateway** | direct provider SDKs | Gateway gives provider failover, cost tracking, ZDR, and `"provider/model"` routing without hardcoding a provider. Default to Claude for reasoning-heavy explanation, with fallback. (See AI_LAYER.md.) |
| PDF | **Playwright (print-to-PDF) in a Vercel Function** | react-pdf, puppeteer, wkhtmltopdf | We already render an HTML report; printing it to PDF via headless Chromium gives pixel-perfect parity with the web report and reuses one template. Fluid Compute's 5GB package limit accommodates Chromium. react-pdf would mean maintaining a second, diverging layout. |
| Charts | **Recharts (or lightweight SVG)** | Chart.js, D3 | Enough for score gauges and trend lines; SSR-friendly. Follow the `dataviz` skill for palette/accessibility. |
| Email | **Marketplace provider (Resend/Postmark via Vercel integration)** | raw SMTP | Provision through the Vercel Marketplace, don't hardcode. |
| Billing | **Stripe (via Marketplace integration) — Phase 2** | — | Deferred past V1 core loop. |

## Language/runtime versions

- **Node.js 24 LTS** (Node 18 deprecated). CLI supports Node ≥ 20 for user reach; web runs on 24.
- **TypeScript ≥ 5.5**, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

## Notable rejections (and why)

- **Edge runtime for the API:** rejected. Streaming and SSE work fine on Node/Fluid Compute; Edge costs
  us Node APIs (spawning `tsc` in local tooling, some libs) for no benefit.
- **Prisma:** rejected as the primary tool — heavier runtime/engine, and we want SQL-forward migrations
  we can also *audit-teach* from. Drizzle chosen.
- **A native SQL parser (libpg-query):** rejected in the portable engine for the native-binary problem.
- **Bundling the LLM into the verdict:** rejected on principle (see product principles).
- **A hosted sandbox to run target code:** rejected for V1 (see ARCHITECTURE.md §8).

## Dependency governance

- Engine `dependencies` require a written justification in the PR (we audit dep bloat; we live it).
- Renovate/Dependabot for updates; lockfile committed; `pnpm audit` in CI.
- No `postinstall` scripts in `@shipready/*` packages (we flag them in others).
