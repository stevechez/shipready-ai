# AI_LAYER.md — ShipReady AI

The single most important rule of this product: **AI never establishes facts.** The deterministic engine
decides *what is true*; the AI layer only makes true things *clearer, prioritized, and actionable*. This
document draws that line precisely and makes it structurally enforceable.

## 1. Where AI is ALLOWED

| Use | Input | Output | Guardrail |
|---|---|---|---|
| **Explanation** | A finding + its evidence facts | Plain-language "why this matters" | Cannot reference anything not in the facts |
| **Remediation drafting** | Finding + evidence + catalog remediation template | Tailored fix guidance/code snippet | Layered on the deterministic template; references real file/line only |
| **Prioritization narrative** | The full set of findings + scores | An ordering rationale ("fix these 3 first because…") | Cannot change severities/scores; only narrates the deterministic order |
| **Executive summary prose** | Pre-computed summary facts (tier, score, top risks, delta) | 2–4 sentences | Numbers/claims must match provided facts (validated) |
| **Rule-quality triage assist (internal)** | User-flagged false positives | Suggested heuristic tweaks for humans | Human-in-the-loop; never auto-edits rules |

## 2. Where AI is FORBIDDEN

- Deciding **whether a finding exists**. (Static analysis only.)
- Setting or altering **severity, confidence, or score**.
- Setting the **readiness tier / gate**.
- Reading or receiving **source code** it wasn't given as finding evidence. (It never sees the repo.)
- Inventing **file paths, line numbers, table names, or CVEs**. It may only use facts provided.
- Being on the **critical path**: a report must fully render if every AI call fails.

**Structural enforcement (not just policy):** the DTO the AI returns has *no* fields for
existence/severity/score. It's `{ explanation: string, remediation?: string, priorityRationale?: string }`.
The system literally cannot let the model add a finding or change a grade, because there is nowhere for
such a value to go, and the output is Zod-validated and cross-checked against the finding's facts before
storage.

## 3. Prompt strategy

- **System prompt** fixes the role: "You explain and remediate *already-detected* issues. You must only
  use the provided evidence facts. If evidence is insufficient, say so; never speculate. Do not restate
  or alter severity or scores."
- **Structured input:** the finding is passed as JSON facts (rule id, title, redacted snippet, structured
  `facts`, catalog remediation template), not raw code. This keeps prompts small, deterministic-ish, and
  leak-proof.
- **Structured output:** use the AI SDK's `generateObject` / `streamObject` with a Zod schema for the
  narrow enrichment DTO. No free-form parsing.
- **Grounding check:** after generation, validate that any file paths / identifiers / numbers mentioned
  appear in the input facts; if the model introduces an unknown identifier, we drop that sentence or fall
  back to the deterministic template (and log it as a grounding miss).
- **Determinism knobs:** low temperature for explanation/summary; prompts + `prompt_version` recorded so
  outputs are reproducible enough and auditable.

## 4. Model selection & the Gateway

- **Access via Vercel AI SDK → AI Gateway** using `"provider/model"` routing (per the Vercel guidance),
  giving provider failover, cost tracking, and zero-data-retention config without hardcoding a provider
  SDK.
- **Default:** a strong Claude model for explanation/remediation/prioritization (reasoning + faithful
  grounding matter most here). A cheaper/faster model tier for short executive-summary prose.
- **Fallback chain:** if the primary provider errors or is over budget, fail over to a secondary model;
  if all fail, render the deterministic template. Enrichment is best-effort, never required.
- Model + prompt version stored on each `finding_enrichment` for reproducibility and A/B evaluation.

## 5. Validation pipeline

```mermaid
flowchart LR
    F[Finding + facts] --> P[Build constrained prompt]
    P --> M[generateObject (Gateway)]
    M --> S[Zod schema validate]
    S -->|ok| G[Grounding check\n(no unknown identifiers)]
    S -->|fail| T[Fallback: template]
    G -->|ok| DB[(finding_enrichments)]
    G -->|fail| T
    T --> DB
```

Every enrichment either passes schema **and** grounding, or is replaced by the deterministic template.
Nothing unvalidated is ever shown.

## 6. Cost optimization

- **Only enrich what's shown/needed:** enrich Critical/High findings eagerly; Medium/Low on demand
  (when the user expands them) — most findings are never viewed individually.
- **Deduplicate by fingerprint:** identical findings (same rule + normalized evidence) across scans
  reuse a cached enrichment; re-enrich only when evidence changes.
- **Batch** multiple findings of the same rule into one call where prompts allow.
- **Per-org budget + queue backpressure:** enrichment runs in a queued job with a per-org daily budget;
  over budget defers (findings still render with templates). AI cost can't become a DoS or a surprise
  bill.
- **Small prompts:** facts-only inputs (no source) keep token counts low and predictable.
- **Streaming** the executive summary/explanations to the UI for perceived speed on the Node runtime
  (no Edge needed).

## 7. Safety, privacy, evaluation

- **No source to the model** — only redacted evidence facts. Reduces both leakage and hallucination
  surface.
- **ZDR** configured at the Gateway; no training on customer data.
- **Prompt-injection hygiene:** evidence snippets are treated as untrusted data, delimited clearly and
  never interpreted as instructions; the system prompt states that repository content is data, not
  commands. Output grounding check further limits damage from any injected instruction.
- **Evaluation:** a golden set of findings with human-approved reference explanations; regression-test AI
  quality on prompt/model changes (faithfulness, no fabricated identifiers, correct severity language).
- **Human-labeled failures** (grounding misses, false reassurances) feed prompt/version iteration.

## 8. Failure behavior (restated because it matters)

If the AI layer is entirely down: findings, evidence, scores, tiers, charts, and templated remediation
all render. The report is complete and correct — just less prose. The verdict is *never* a function of
AI availability. That property is what lets us call ourselves "deterministic."
