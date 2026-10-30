<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Model Rankings History, Fit Scoring, News & Local Grading

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** models, rankings, llmfit, hardware-fit, news, admin, local-grading
**Related:** epic-llama-swap.md (serve-leg owner; generator must not touch user config), TASK-odysseus-hwfit-style-hardware-fit-scoring-for-local-models (Phase 2 predecessor, Status Not Started), epic-platform-research.md (Candidate 20, Odysseus hwfit sweep)

**Overview:** (see sections below)

## Summary

loop-lore can serve local models and route remote ones, but it owns **no persisted history** of which model is good, which fits the current box, or what changed upstream. This epic builds that memory in four slices: (1) an append-only `model_rankings` + `ranking_snapshots` store with a `scope`/`basis` trust discriminator; (2) hardware fit verdicts via `llmfit` shell-out surfaced on the existing providers admin surface; (3) a model-news ingestion pipeline with an admin triage tab; (4) local model grading from the app's own emoji-reaction surface.

Decision record (research-only, gitignored scratchpad, not merged): `.tmp/research/llmfit/10-synthesis.md` (entry point), with `00`–`09` substantiating every claim below. The one-paragraph verdict: llmfit is a hardware-aware **fit-scoring engine plus a static catalog** — shell out to it for fit, build the catalog slice and observation history loop-lore-side, generate a loop-lore-owned config file rather than touching the user's.

## Current State (reviewed 2026-10-30)

- No hardware detection anywhere in `src/`; the gap is already known in the plan corpus.
- `model_capabilities` is the per-provider+model registry refreshed in place by the provider-health scan — the natural home for fit verdicts, but it overwrites, so it cannot answer "what did we measure last Tuesday".
- No ranking-history table, no news-ingestion code at all, no index on `messages.model_id` (every per-model aggregation is a full scan).
- loop-lore spawns servers (`server-external-manager`) and owns the *serve* leg; llmfit talks to running ones — complementary, not duplicate.
- `TASK-odysseus-hwfit-style-hardware-fit-scoring-for-local-models` (Not Started) already specifies hwfit-style scoring inputs; this epic's Phase 2 is its llmfit-grounded successor, not a duplicate.

## Design

**One table, not three.** `model_rankings` is append-only with `scope` (`global`|`instance`), `scope_key`, `metric` (`fit_score`, `tps`, `rank`, `reaction_rate`, ...), `basis` (`formula`|`imported`|`measured`|`observed`), `source` (`llmfit`, board name, `loop-lore`), `observed_at`, `expires_at`. "Global vs per-instance" are scopes, "UGI" is a source. Full sketch: `03-loop-lore-integration.md` §6 (storage + freshness schema).

**Freshness policy:** `measured` never expires; `imported` expires at row date + 180 d; `formula` expires at `observed_at` + 7 d or immediately on hardware-fingerprint change. Per-source `next_refresh_after`: llmfit catalog 7 d, localmaxxing leaderboard 24 h, UGI CSV 24 h, LocalAI gallery 7 d. Prune `measured` rows older than 180 days only when not the latest for their subject (telemetry-cleanup pattern).

**Speed tiers never share a number:** predicted (llmfit roofline, `formula_estimate` + `estimate_confidence`) vs advertised (board tables) vs measured (local bench). A number renders with its tier or not at all.

**News is greenfield:** keyless fan-in of HF model API + per-model `/commits/main` (weight-change confirmation), GitHub `releases.atom` for runtimes, HF/Ollama blog RSS, arXiv Atom API. There is no HF "model news" feed. News gets its own table — a release is an event, not a score.

**Local grading counts messages, not emoji:** per-message unit, admin-configurable positive valence set, Beta-Binomial estimator, published only at G ≥ 30 else `insufficient_data` as a first-class UI state. Never averaged with imported opinion.

**Hard rules (rejected options):** no vendoring the 17,700-row llmfit catalog (MIT covers code, not catalog content); no vendoring `llmfit-core` into TS (process-level integration); no rewriting the user's llama-swap config (loop-lore-owned path, refuse on conflict); no tabbyAPI/jan code reuse (AGPL-3.0 / source-available); no scraping arena.ai or swebench.com; Artificial Analysis excluded by default (key-gated, internal-use-only).

## Work Items

| # | Work Item | Status | Ticket |
| - | --------- | ------ | ------ |
| 1 | Storage foundation — `model_rankings` + `ranking_snapshots` migration (next free number **082**), `DOMAIN_MAP` registration, `messages.model_id` index, snapshot cron job | Not Started | TASK-model-rankings-storage-foundation |
| 2 | llmfit shell-out fit service — `which llmfit` detection, `fit --json` per (hw fingerprint, model, ctx) cache, degrade to *no fit data*, never a guess | Not Started | TASK-llmfit-fit-service-via-shell-out |
| 3 | Fit column on providers admin surface — extend `/admin/providers/:name/models` + rescan path, no new route | Not Started | TASK-fit-column-on-providers-admin-surface |
| 4 | News ingestion — feed fan-in + news table + cron, weight-change confirmation via `/commits/main` | Not Started | TASK-model-news-ingestion-pipeline |
| 5 | News admin tab — partial + Alpine module, read + acknowledge/dismiss triage; no downloader wiring in first slice | Not Started | TASK-model-news-admin-tab |
| 6 | Reaction-table prereqs — unique constraint + visibility filter fixes before anything scores the table | Not Started | TASK-reaction-table-prereqs-for-model-grading |
| 7 | Reaction scorer — Beta-Binomial + periodic recompute + `unranked — N samples` UI state | Not Started | TASK-reaction-based-model-grading-scorer |

## Dependencies

- `src/cron/jobs.ts` `defineJob` + import-lazy body (ingestion/recompute template); provider-health scan is the population-path template
- `src/views/admin.html` tab/panel/partial machinery + `src/frontend/alpine/` module pattern (news tab)
- `model_capabilities` registry (capability facts; fit verdicts attach here, history in `model_rankings`)
- `message_reactions` + `messages.model_id` linkage + `model_comparisons` (local grading inputs; pairwise verdicts stay separate from reaction rate)
- `epic-llama-swap.md:32,40-42` — the generator exclusion this epic must not violate (Phase 5 needs an amendment there first)

## Related Epics

- `epic-llama-swap.md` — serve-leg owner; Phase 5 (loop-lore-owned config generator) is blocked on amending its deliberate exclusion
- `epic-platform-research.md` Candidate 20 — hwfit predecessor context

## Unticketed Gaps

- Phase 5 (llama-swap config generator at a loop-lore-owned path + download→validate→register→serve app-manager chain): **Blocked** — needs a new epic or an amendment to `epic-llama-swap.md:32,40-42`; a ticket alone is not enough since the exclusion is deliberate. No ticket filed.
- Remote-API model ranking tier: owned by `src/generation/routing/router.ts`, never enters the llmfit path — out of this epic.
- `TASK-odysseus-hwfit-style-hardware-fit-scoring-for-local-models` still points at nonexistent `epic-byok-local-models`; items 2–3 here supersede it — close or retarget that ticket when item 2 lands.

## Non-Goals

- Re-implementing llmfit's roofline/fit/quant-hierarchy math; vendoring its catalog; vendoring `llmfit-core` into the TS backend
- A "HuggingFace model news" feed; scraping arena.ai / swebench.com; Artificial Analysis ingestion by default; presenting the Open LLM Leaderboard as current (historical baseline only)
- Averaging local experience with imported opinion; publishing local ranks below G < 30; treating decorative emoji as sentiment

## Acceptance Criteria

- [ ] Fit verdict per (hw fingerprint, model, ctx) persists as a `model_rankings` row and renders on the providers admin surface with its confidence tier
- [ ] Board rows (LMArena, LiveBench, LiveCodeBench, UGI, SWE-rebench, Hallucinations) ingest on schedule with `scope='global'`, `basis='imported'`, per-row licence noted; stale `imported` rows expire per policy
- [ ] News tab renders the three feed families as a triage queue (acknowledge/dismiss); a weight change is confirmed via `/commits/main`, not by catalog churn
- [ ] Local reaction grades publish only at G ≥ 30 with the `unranked — N samples` state below; reaction prereq defects fixed first
- [ ] No user config file is written; no key-gated or ToS-forbidden source is ingested by default