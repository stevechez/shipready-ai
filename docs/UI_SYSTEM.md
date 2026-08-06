# UI_SYSTEM.md — ShipReady AI

The UI has one job: make a deterministic verdict **trustworthy and legible**. It should feel like a
precise instrument, not a dashboard toy — closer to a security console than a marketing site. Calm,
dense-where-it-counts, evidence-forward. We build on **shadcn/ui (Radix) + Tailwind**, owning the
component code (no black-box UI dep — consistent with our anti-bloat ethos).

> Before building any net-new UI, follow the `frontend-design` skill for aesthetic direction and the
> `dataviz` skill for any chart. This doc sets the system; those skills set the craft.

## 1. Design principles

1. **Evidence over adjectives.** Every claim shows its receipt (file:line, snippet). The UI's primary
   unit is the *finding card with evidence*, not a number.
2. **Honest severity.** Color and hierarchy encode severity/confidence truthfully — no green-washing, no
   fear-mongering. A blocked repo looks blocked; a healthy one looks calm.
3. **Legible density.** Engineers scan fast; give them tight, sortable, filterable lists with strong
   typographic hierarchy. Non-engineers get the summary up top.
4. **Determinism visible.** Show catalog/engine version, "how this score was computed," and "not
   applicable" categories. Trust comes from showing the work.
5. **AI clearly labeled.** Enrichment text is visibly marked as AI-generated and sits beside (never on
   top of) the deterministic evidence.

## 2. Design tokens

- **Type:** one strong sans (e.g. Inter/Geist) for UI; a mono (e.g. Geist Mono/JetBrains Mono) for code
  evidence, file paths, rule ids. Clear scale (12/14/16/20/24/32).
- **Spacing/radius:** 4px base grid; medium radius; restrained shadows (elevation for cards/menus only).
- **Neutral palette:** a true neutral gray ramp for surfaces/text; the product is content-forward, so
  color is reserved for meaning (severity), not decoration.
- **Semantic color = severity** (see §5). Semantic colors are the *only* saturated colors in the core UI.

## 3. Dark mode

- **First-class, both themes fully styled.** `next-themes`, class strategy, tokens defined for light and
  dark; no theme is an afterthought.
- Charts, badges, and the score gauge have explicit light/dark values (verified for contrast in both).
- Respect `prefers-color-scheme`; user can override; persisted.

## 4. Accessibility (we audit a11y — we must exemplify it)

- **WCAG 2.2 AA** target: contrast ≥ 4.5:1 text / 3:1 large & UI; visible focus rings; full keyboard
  operability (Radix gives us much of this).
- **Never color-only:** severity always pairs color with an **icon + text label** (e.g. red ▲ "Critical").
- Semantic landmarks/headings; `aria` on interactive components; charts have text/table fallbacks; alt
  text on meaningful images; reduced-motion honored.
- A11y is in the Definition of Done and CI (axe checks on key screens).

## 5. Severity & confidence system

| Severity | Color role | Icon | Usage |
|---|---|---|---|
| Critical | `danger` (red) | filled triangle | Blocks readiness |
| High | `warningStrong` (orange) | triangle | At-risk driver |
| Medium | `warning` (amber) | diamond | Notable |
| Low | `info` (blue) | dot | Advisory |
| Info | `neutral` (gray) | dot-outline | FYI |

- **Confidence** shown as a secondary badge (`Certain` / `Firm` / `Tentative`); tentative findings are
  visually grouped under a "Worth reviewing" subsection so they never masquerade as blocking facts.
- Colors chosen colorblind-safe; validated in light+dark; text label always present.

## 6. Component inventory

Built on shadcn primitives (Button, Card, Badge, Tabs, Dialog, DropdownMenu, Tooltip, Table, Sheet,
Toast, Skeleton). ShipReady-specific composites:

| Component | Purpose |
|---|---|
| `ReadinessGauge` | 0–100 gauge with tier color band + tier label; the hero of a report |
| `TierBadge` | Blocked / At Risk / Ready pill with icon + text |
| `SeverityBadge` / `ConfidenceBadge` | consistent severity/confidence chips |
| `FindingCard` | the core unit: title, badges, file:line, code snippet, facts table, remediation, AI-explanation slot, status control |
| `EvidenceSnippet` | syntax-highlighted, line-numbered, offending line highlighted, secret-masked |
| `ScoreBreakdown` | per-category subscore bars incl. "N/A", expandable to the arithmetic |
| `CategorySection` | grouped findings with counts, collapsible |
| `TrendChart` | score over time (≥2 scans) |
| `ScanSummaryHeader` | tier + score + top-3 risks + delta |
| `SuppressionNotice` | flags scans that reached a tier via suppression |
| `EmptyState` / `ScanRunningState` | first-run and processing states |

## 7. Key screens

### Dashboard (org home)
Projects list with each project's latest tier/score and trend spark; CTA to scan; recent scans feed.

### Project view
Trend chart, scan history table (date, tier, score, delta, findings by severity), latest report entry
point.

### Report / scan view (the product's centerpiece)
1. **`ScanSummaryHeader`** (executive summary) — tier, gauge, plain-language verdict, top risks, delta,
   "share/export."
2. **`ScoreBreakdown`** — categories with subscores, "how computed" expander, catalog/engine version.
3. **Findings** — filter/sort by category/severity/confidence/status; `CategorySection` → `FindingCard`s;
   tentative grouped separately; suppressions surfaced.
4. **Appendix** — methodology, scan metadata, not-applicable categories.

### Finding triage
Within a `FindingCard`: set status (open/acknowledged/fixed/wontfix/false_positive), read AI explanation,
copy remediation, open docs link, report false positive (feeds rule quality).

### Settings
Org, members/roles, API tokens (create shows plaintext once; list shows prefixes), billing (Phase 2).

### Auth
Sign-in (magic link + GitHub OAuth), org create/switch.

## 8. Navigation & IA

- Left rail: Org switcher, Dashboard, Projects, (Reports), Settings. Top bar: search, theme toggle, user
  menu.
- Breadcrumbs: Org ▸ Project ▸ Scan ▸ Finding.
- Deep-linkable findings (`#SR-RLS-001-fp_…`) for sharing a specific issue.

## 9. States & feedback

- Explicit **loading** (skeletons), **empty** (first scan guidance with the `npx` command), **running**
  (enrichment pending — findings already visible), **error** (actionable, with request id), **degraded**
  (AI unavailable → "explanations pending," never blocks the report).
- Optimistic status changes on findings with toast + rollback on failure.

## 10. Performance & implementation notes

- Server Components for data-heavy report rendering; client islands only for interactivity (filters,
  status toggles, theme).
- Virtualize long finding lists.
- No layout shift on chart load; SSR charts with reserved space.
- Reuse the exact report components for the PDF path (REPORT_ENGINE.md) so web and PDF never diverge.
