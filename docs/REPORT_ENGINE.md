# REPORT_ENGINE.md — ShipReady AI

> **Status note (post-lock):** The report engine consumes **canonical `ReportFinding[]` + `PolicyResult`
> only** and is **provider-blind** (`PROVIDER_ARCHITECTURE.md` §6). Two alignments override any stronger
> wording below: (1) **report equivalence is scoped to the verdict/canonical-field level (§0 boundary)** —
> different provider *sets* legitimately yield different reports (richer providers change the finding set,
> coverage, and corroboration); the report faithfully reflects that. (2) Provider identity/provenance
> appears **only** in a collapsible "Analysis sources" appendix and drives nothing. The report also renders
> a first-class **coverage** section (PASS vs. INSUFFICIENT_COVERAGE).

The report is where determinism meets communication. It must be **defensible** (every claim cites
evidence), **legible to non-engineers** (executive summary), and **actionable for engineers** (exact
locations + remediation). One HTML template is the single source; PDF is that template printed.

## 1. Two audiences, one document

| Section | Audience | Content |
|---|---|---|
| **Executive summary** | Client / non-engineer / manager | Readiness tier, score, the "can I ship?" sentence, top 3 risks in plain language, what changed since last scan |
| **Developer report** | The person fixing it | Findings grouped by category + severity, each with evidence (file:line, snippet), remediation, rule link, confidence |
| **Appendix** | Auditors | Methodology, catalog version, engine version, scan metadata, suppressions, "not applicable" categories, full finding list |

The same data drives all three; we never show a claim in the summary we can't back in the developer
section.

## 2. Rendering architecture

```mermaid
flowchart LR
    Scan[(scan + findings + enrichments)] --> VM[Report ViewModel\n(pure transform)]
    VM --> HTML[HTML report\n(React Server Component)]
    HTML --> Web[Dashboard view]
    HTML --> PDF[Playwright print-to-PDF\n(Vercel Function)]
    VM --> JSON[Machine report\n(shareable JSON)]
```

- **Report ViewModel:** a pure function `(scan, findings, enrichments, catalog) → ReportVM`. Sorts,
  groups, computes the score breakdown display, resolves "not applicable" categories, and merges AI
  enrichment text onto deterministic findings. Fully unit-tested; no IO.
- **HTML:** rendered by a React Server Component using the shared design system (UI_SYSTEM.md). This is
  the canonical rendering — the dashboard shows it live.
- **PDF:** the **same HTML** printed to PDF via headless Chromium (Playwright) in a Vercel Function
  (Fluid Compute, Node runtime). One template ⇒ web and PDF never diverge. Print CSS handles page
  breaks, headers/footers (org, scan date, page numbers), and hides interactive chrome.
- **JSON:** the redacted machine report for programmatic consumers / CI artifacts.

## 3. Evidence formatting

- Each finding renders: **rule id + title**, **severity** and **confidence** badges, **file:line**
  (clickable in web to the code viewer if provided), a **minimal code snippet** with the offending
  line highlighted, the structured **facts**, and **remediation**.
- **Redaction is already applied** upstream (engine marks, CLI masks); the report additionally guards
  against rendering anything flagged `secret:true` unmasked.
- Snippets are syntax-highlighted deterministically (server-side highlighter, no runtime fetch), with a
  few lines of context, line numbers matching source.
- Facts render as a small key/value table so the evidence reads the same whether or not the AI
  explanation loaded.

## 4. Recommendations / remediation

- **Deterministic baseline:** every rule ships a **remediation template** in the catalog (stack-aware,
  e.g. the exact `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` + a policy skeleton for `SR-RLS-001`). This
  renders even with the AI layer down.
- **AI enhancement (optional):** `finding_enrichments` add a tailored explanation, a remediation
  specific to the user's evidence, and a priority rationale. Clearly labeled as AI-generated and always
  layered *on top of* the deterministic template — never replacing the cited evidence.
- Remediation never fabricates code paths; it references the finding's real file/line and the template.

## 5. Executive summary generation

- Structure is **deterministic** (tier, score, top risks by severity×weight, delta vs previous scan).
- Prose is **AI-assisted but constrained**: the AI receives only the already-computed summary facts and
  writes 2–4 sentences; it cannot introduce findings or numbers not in the facts (validated against the
  ViewModel — see AI_LAYER.md). If AI is unavailable, a templated summary renders from the same facts.
- Tone: honest and specific ("One critical data-exposure issue must be fixed before shipping"), never
  alarmist or falsely reassuring.

## 6. Charts

- **Score gauge** (0–100) with tier color band.
- **Category breakdown** (bar) showing subscore per applicable category, "N/A" for others.
- **Severity distribution** (stacked bar/donut) of open findings.
- **Trend line** (score over time) on the project view once ≥2 scans exist.
- Charts follow the `dataviz` skill: colorblind-safe categorical palette, legible in light/dark,
  text labels not color-only, SSR-rendered (Recharts/SVG), no external requests (works in the CSP-locked
  PDF and in Artifacts).

## 7. Sharing & artifacts

- Reports render live in the dashboard (RLS-scoped).
- **PDF export** stored in Supabase Storage; downloadable by org members.
- **Public share link:** optional, unguessable `share_slug`, `expires_at`, `noindex`, revocable;
  shows the report read-only without evidence the user chooses to withhold (a "share without code
  snippets" toggle for sensitive handoffs).
- Every shared/exported report footer states: catalog version, engine version, scan timestamp, and
  "Static analysis; findings reflect repository state at scan time" — honest scoping.

## 8. Determinism & regeneration

- Given the same `scan` + `catalog_version`, the deterministic portions of the report are byte-stable.
- AI enrichment is regenerable and versioned; regenerating it never changes findings, scores, or the
  gate — only the prose. A report always renders fully from deterministic data alone.

## 9. Accessibility & i18n

- Reports meet the same a11y bar we audit for (semantic headings, contrast, alt text on chart
  fallbacks, keyboard-navigable in web). See UI_SYSTEM.md.
- Copy is centralized for future localization; V1 English-only.
