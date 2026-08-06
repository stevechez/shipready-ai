# FILE_SCANNER.md — ShipReady AI

The scanner turns a directory on disk into a **`ProjectModel`**: a normalized, parsed, in-memory set of
facts that rules consume. Rules never touch the raw filesystem — this keeps them pure, fast, and
testable, and confines all IO and parsing quirks to one layer.

## 1. Pipeline

```mermaid
flowchart TD
    A[Resolve root + read config] --> B[Discover files\n(gitignore-aware walk)]
    B --> C[Classify files\n(role + language)]
    C --> D[Detect frameworks\n(package.json + markers)]
    D --> E[Parse]
    E --> E1[TS/JS → AST\n(TS compiler API)]
    E --> E2[SQL/migrations →\npgsql-ast-parser]
    E --> E3[Configs → typed]
    E --> E4[Lockfile → dep graph]
    E1 & E2 & E3 & E4 --> F[Build ProjectModel]
    F --> G[Optional: run user's tsc\n(compile status)]
    G --> F
```

Everything before `ProjectModel` is IO/parsing; everything after is pure rule evaluation.

## 2. File discovery

- **Root resolution:** the git root (or CWD). Records whether it's a git repo (needed for "is `.env`
  *tracked*?" — a committed secret is worse than an ignored one).
- **Walk** with `.gitignore` semantics (via `ignore`), plus ShipReady's own ignore config
  (`shipready.config.ts` → `ignore: []`). Always skip `node_modules`, `.git`, `dist`, `.next`,
  `coverage`, and other build outputs from *source* scanning — but still read the **lockfile** and
  **package.json** from those excluded areas as needed.
- **Caps & guards:** max file size (skip/flag very large files), max total files (with a clear
  "truncated scan" notice rather than silent partial), symlink loop protection, binary-file skip.
- **Determinism:** results sorted by path; the walk order never affects findings.

## 3. File classification

Each discovered file gets a `role` and `language`, so rules can target precisely:

| Role | Heuristic |
|---|---|
| `route-handler` | `app/**/route.ts`, `pages/api/**` |
| `server-component` / `client-component` | RSC by default in `app/`; `client` if `"use client"` |
| `server-action` | function with `"use server"` |
| `middleware` | `middleware.ts` at root/app |
| `migration` | `supabase/migrations/**.sql`, `drizzle/**` |
| `sql` | other `.sql` |
| `config` | `next.config.*`, `tsconfig.json`, `package.json`, `.env*`, `tailwind.config.*` |
| `component` | `.tsx` under app/components |
| `test` | `*.test.*`, `*.spec.*`, `__tests__/**` (usually excluded from certain rules) |
| `generated` | matched by config/known patterns (excluded from arch/dup rules) |
| `source` | fallback |

`language`: `ts | tsx | js | jsx | sql | json | env | other`.

## 4. Framework & platform detection

From `package.json` deps + marker files, populate `ProjectModel.frameworks`:

- **Next.js:** `next` dep + `app/` or `pages/`; capture major version + App vs Pages router.
- **Supabase:** `@supabase/supabase-js` dep, `supabase/` dir, `SUPABASE_*` envs referenced.
- **Drizzle/Prisma:** deps + config/dirs (for migration parsing strategy).
- **Package manager:** presence of `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock`.
- **Tailwind/shadcn, Vercel** (`vercel.json`/`vercel.ts`), test runner, TS.

Detection drives each rule's `appliesTo` — a repo with no Supabase never sees RLS findings, and its
DB/RLS category is scored "not applicable" (SCORING.md §4).

## 5. Parsing

### TypeScript / JavaScript (AST)
- **TS Compiler API** as the primitive (STACK.md). Build a `Program` from the discovered TS files using
  the project's own `tsconfig.json` (respecting `paths`, `jsx`, etc.) so we resolve modules the way the
  project does.
- Provide rules helpers over the AST: find call expressions, imports, JSX elements, exported handlers,
  `"use client"/"use server"` directives, string/template literals (for secret + SQL detection),
  environment access (`process.env.X`).
- Positions (line/col) captured for every node → exact evidence locations.
- **Robustness:** a file that fails to parse becomes an `inconclusive`/`ruleError` note, never a silent
  pass. Syntax errors are themselves a low-severity signal.

### SQL / migrations
- **`pgsql-ast-parser`** to parse migration SQL into statements: `CREATE TABLE`, `ALTER TABLE ... ENABLE
  ROW LEVEL SECURITY`, `CREATE POLICY` (with `USING`/`WITH CHECK` expressions), `DROP …`, index
  creation, FK definitions.
- Build a **schema model**: tables (schema-qualified), columns, PKs/FKs, indexes, whether RLS is
  enabled, and the set of policies per table with their predicates. This is what `SR-RLS-*`, `SR-DB-*`
  consume.
- Migrations processed in filename order to compute the *effective* end-state schema (a table's RLS may
  be enabled in a later migration than its `CREATE`).
- Fallback: if a statement can't be parsed, record it as inconclusive for that file; never assume RLS
  present or absent from a parse failure.

### Configuration
- `package.json` (scripts, deps, `type`), `tsconfig.json` (strict flags, `paths`), `next.config.*`
  (headers, redirects, experimental flags), `.env*` (names only; values scanned for secrets), Tailwind,
  `vercel.json`/`vercel.ts`. Parsed into typed structures with positions where possible.
- `.env` handling: distinguish **tracked-by-git** (committed) vs local; flag `NEXT_PUBLIC_`-prefixed
  secret-shaped vars.

### Dependencies (lockfile-first)
- Parse the **lockfile** (pnpm/npm/yarn) into a resolved dependency graph: package → version(s),
  direct vs transitive, duplicate majors, presence of `postinstall`/lifecycle scripts (from package
  metadata), and known-bad list matches.
- Prefer the lockfile (declarative, exact) over walking `node_modules` (may be absent/partial in CI).

## 6. The compile check (the one execution we allow)

- `SR-TS-002` needs to know if the project actually compiles. Reconstructing this statically is
  unreliable, so — **only in the CLI, only with consent** — we spawn the **project's own**
  `tsc --noEmit` (or `pnpm typecheck` if defined) as the user's process, in the user's environment.
- This is not "executing the target app"; it's running the user's compiler on the user's machine. It's
  off in `--no-typecheck` mode and never happens server-side.
- Result (exit code + parsed diagnostics count/sample) feeds the finding. Timeout + resource guard.

## 7. The `ProjectModel` (rule-facing contract)

```ts
interface ProjectModel {
  root: string;
  isGitRepo: boolean;
  frameworks: FrameworkInfo;                 // next, supabase, packageManager, drizzle, ...
  files: FileEntry[];                        // path, role, language, size, tracked
  ts: {
    program: TsProgramView;                  // helper facade over the TS AST
    tsconfig: TsConfigFacts;                 // strict flags, paths, target
    compile?: { ran: boolean; ok: boolean; diagnostics: number; sample: string[] };
  };
  db: {
    tables: TableModel[];                    // columns, pk, fks, indexes, rlsEnabled, policies[]
    migrations: MigrationFile[];             // ordered, parsed statements
    parseErrors: { file: string; reason: string }[];
  };
  deps: {
    manager: 'pnpm'|'npm'|'yarn'|'unknown';
    graph: DependencyNode[];                 // name, version, direct, dupMajors, lifecycleScripts
  };
  env: { name: string; tracked: boolean; public: boolean; }[];
  config: { next?: NextConfigFacts; vercel?: VercelFacts; tailwind?: boolean; };
  scanMeta: { truncated: boolean; skipped: SkippedFile[]; durationMs: number; engineVersion: string; };
}
```

- **Facts only** — no findings, no opinions. Rules interpret; the model reports.
- Everything a rule needs is here, so rules are pure `(ProjectModel) => Finding[]`.
- `scanMeta.truncated`/`skipped` guarantee a scan is never *silently* incomplete — the report says so.

## 8. Performance

- Single filesystem pass; parse each file once; share the TS `Program` across all TS rules.
- Lazy/parallel parsing where safe; the model is built once, rules run over it (cheap).
- Target: a typical AI-built Next.js/Supabase repo scans in a few seconds on a laptop (excluding the
  optional `tsc` step, which is bounded by the user's own compiler speed).

## 9. Determinism & testability

- Given identical bytes on disk + identical engine/catalog versions, the `ProjectModel` and resulting
  `ScanResult` are byte-stable (stable sort, no clock/random in facts; `durationMs` excluded from the
  hashed portion).
- **Golden fixtures:** a corpus of tiny repos exercises every parser branch (RLS present/absent,
  committed secret, service key in client, destructive migration, etc.). CI diffs scanner output against
  snapshots.
