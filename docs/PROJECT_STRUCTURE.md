# PROJECT_STRUCTURE.md — ShipReady AI

A pnpm + Turborepo monorepo. The **engine, schema, and CLI are independently publishable packages**; the
web app consumes the schema (types) and never the engine runtime. Boundaries are enforced by package
graph, not convention alone.

## 1. Directory tree

```
shipready-ai/
├─ docs/                          # this blueprint
├─ package.json                   # workspace root (private)
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json             # strict, shared compiler options
├─ biome.json
├─ .changeset/
├─ .github/workflows/             # CI: lint, typecheck, test, golden corpus, advisors
│
├─ packages/
│  ├─ schema/                     # @shipready/schema  (Zod + types, single source of truth)
│  │  ├─ src/
│  │  │  ├─ scan.ts               # ScanResult, Finding, Evidence
│  │  │  ├─ report.ts             # ReportVM DTOs
│  │  │  ├─ api.ts                # request/response DTOs
│  │  │  ├─ catalog.ts            # RuleId, Category, Severity, Confidence, catalog types
│  │  │  └─ index.ts
│  │  └─ package.json
│  │
│  ├─ engine/                     # @shipready/engine  (pure, deterministic)
│  │  ├─ src/
│  │  │  ├─ scanner/              # discovery + parsers → ProjectModel
│  │  │  │  ├─ discover.ts
│  │  │  │  ├─ classify.ts
│  │  │  │  ├─ frameworks.ts
│  │  │  │  ├─ ts-program.ts      # TS compiler API facade
│  │  │  │  ├─ sql.ts             # pgsql-ast-parser → schema model
│  │  │  │  ├─ config.ts
│  │  │  │  ├─ deps.ts            # lockfile parsing
│  │  │  │  └─ model.ts           # ProjectModel builder
│  │  │  ├─ rules/
│  │  │  │  ├─ registry.ts        # isolated per-rule execution
│  │  │  │  ├─ rls/               # SR-RLS-*
│  │  │  │  ├─ supabase/          # SR-SUP-*
│  │  │  │  ├─ security/          # SR-SEC-*
│  │  │  │  ├─ auth/              # SR-AUTH-*
│  │  │  │  ├─ authz/             # SR-AUTHZ-*
│  │  │  │  ├─ api/               # SR-API-*
│  │  │  │  ├─ db/                # SR-DB-*
│  │  │  │  ├─ deps/              # SR-DEP-*
│  │  │  │  ├─ typescript/        # SR-TS-*
│  │  │  │  ├─ a11y/              # SR-A11Y-*
│  │  │  │  ├─ perf/              # SR-PERF-*
│  │  │  │  ├─ arch/              # SR-ARCH-*
│  │  │  │  └─ config/            # SR-CFG-*
│  │  │  ├─ scoring/              # local (reference) score
│  │  │  ├─ catalog/              # rule metadata + weights + remediation templates
│  │  │  ├─ evidence.ts           # evidence building + secret marking
│  │  │  └─ index.ts              # runScan(model) : ScanResult
│  │  ├─ fixtures/                # golden repos (known-good/known-bad)
│  │  └─ package.json
│  │
│  ├─ cli/                        # @shipready/cli  (npx shipready)
│  │  ├─ src/
│  │  │  ├─ commands/             # scan, push, login, report, whoami
│  │  │  ├─ redact.ts             # mask secrets before upload
│  │  │  ├─ typecheck.ts          # spawn user's tsc (consent-gated)
│  │  │  ├─ report-local.ts       # offline HTML/JSON
│  │  │  ├─ api-client.ts         # talks to /v1
│  │  │  └─ index.ts
│  │  └─ package.json
│  │
│  ├─ config-tsconfig/            # shared tsconfig presets
│  └─ ui/  (optional)             # shared UI primitives if extracted from web
│
├─ apps/
│  └─ web/                        # Next.js App Router (dashboard + /api/v1)
│     ├─ app/
│     │  ├─ (marketing)/          # public pages
│     │  ├─ (auth)/               # sign-in, callback
│     │  ├─ (dashboard)/          # org, projects, reports, settings
│     │  ├─ p/[project]/scans/[scanId]/   # report view (+ public share under /r/[slug])
│     │  └─ api/v1/               # Route Handlers (public token API)
│     │     ├─ scans/route.ts
│     │     ├─ scans/[id]/route.ts
│     │     ├─ projects/[id]/scans/route.ts
│     │     ├─ catalog/route.ts
│     │     └─ reports/[id]/route.ts
│     ├─ lib/
│     │  ├─ db/                   # Drizzle schema, migrations, queries
│     │  ├─ auth/                 # supabase server/client, guards, authorize()
│     │  ├─ scoring/              # SERVER recompute (authoritative)
│     │  ├─ ai/                   # enrichment (Gateway), prompts, validation
│     │  ├─ report/              # ReportVM, HTML render, PDF (Playwright)
│     │  ├─ ratelimit/            # limits + quotas
│     │  └─ api/                  # zod-validated handler helpers, error envelope
│     ├─ components/              # shadcn + ShipReady composites (FindingCard, gauge…)
│     ├─ supabase/migrations/     # RLS policies + schema (SQL, reviewed)
│     └─ package.json
│
└─ tooling/                       # scripts: seed catalog, gen openapi, run golden corpus
```

## 2. Layering rules (enforced)

```
schema  ←  engine  ←  cli
schema  ←  web
```

- **`schema` depends on nothing** (except Zod). It is the contract.
- **`engine` depends only on `schema`** + its vetted parser deps. **No network, no LLM, no web imports.**
- **`cli` depends on `engine` + `schema`.** Contains no rule logic.
- **`web` depends on `schema`** (types) and its own libs. It **must not import `engine` runtime** — it
  never has source to scan. (A lint rule / dependency-cruiser check enforces this; violating it is a CI
  failure — we dogfood `SR-ARCH-*`.)
- Within `web`: `app/` → `lib/` → `db/`. UI components never import `db` directly; they receive data via
  Server Components / actions. `lib/scoring` (server recompute) is the only authoritative scorer.

## 3. Naming conventions

- **Files:** `kebab-case.ts`. React components `PascalCase.tsx`. Route handlers `route.ts`.
- **Types/interfaces/components:** `PascalCase`. Functions/vars: `camelCase`. Constants: `UPPER_SNAKE`.
- **Rule files:** one rule per file where practical, named by id, e.g. `rls/sr-rls-001.ts` exporting a
  `Rule`. Category `index.ts` aggregates.
- **Zod schemas:** `FooSchema` + inferred `type Foo = z.infer<typeof FooSchema>` co-located in `schema`.
- **Test files:** `*.test.ts` beside source; golden fixtures under `fixtures/`.
- **DB tables:** `snake_case`, plural (`findings`). Columns `snake_case`.

## 4. Import strategy

- **Package imports** across boundaries: `@shipready/schema`, `@shipready/engine` — never deep relative
  paths across packages.
- **Path aliases within a package:** `@/…` (configured per package tsconfig), no `../../../` chains.
- **Barrel files** (`index.ts`) expose a package's public surface; internal modules aren't imported
  cross-package.
- **No circular imports** (checked in CI). Server-only modules marked with `import 'server-only'` in web
  to prevent accidental client bundling (e.g. anything touching the service-role key).
- **Type-only imports** use `import type` (respected by bundlers; keeps runtime lean).

## 5. Ownership boundaries recap

| Boundary | Contract | Enforcement |
|---|---|---|
| Engine ⇄ world | `@shipready/schema` types | package graph + lint |
| CLI ⇄ server | `/api/v1` (OpenAPI from Zod) | contract tests |
| AI ⇄ findings | narrow enrichment DTO (no severity/existence fields) | Zod + grounding check |
| Client ⇄ server trust | server recompute of score | server code path |
| Tenant isolation | RLS `org_id` | Postgres policies + CI advisors |
