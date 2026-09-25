<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-affordance-action-parser: Two-stage parser (regex + constrained-LLM) for free-form chat -> typed Action

**Status:** Draft
**Priority:** P0 (within EPIC-RESEARCH-AGENCY-AFFORDANCE)
**Effort:** 2-3 days
**Parent epic:** `epic-research-agency-affordance.md`
**Related:** `src/regex/intent.ts` (keyword router - **superseded by this ticket**), `src/assistant/intent.ts` (avatar intent detection - must not regress), `src/services/actor-items.ts`, `src/validation/schemas/responses.ts`

**Summary:**

## Goal

Replace the keyword-only intent router (`src/regex/intent.ts` returns one of `generate | tool_exec | api_call | chat`) with a **two-stage parser** that emits a typed Action `{ verb: Verb, target?: TargetRef, instrument?: TargetRef, agency_mode: free|forced|blocked|skipped }`.

**Context:**

## Why

- Existing `INTENT_PATTERNS` is keyword routing, not verb+target parsing - one order of magnitude short of what the math tickets need.
- Two-stage pattern: deterministic fast-path for ~85% of inputs, constrained LLM fallback for novel inputs. Stage 1 is auditable; Stage 2 is novel-input-safe (Gibson/Norman affordance theory; OpenHOI 2025).
- Common contract (Rhasspy post-STT JSON): `{intent, slots, confidence}` is the canonical dispatch shape.

**Acceptance Criteria:**

- [ ] Closed verb enum covers: `use, equip, unequip, drop, give, take, open, close, read, examine, attack, defend, talk, move, hide, search`. Extensible via config.
- [ ] Stage-1 parser: regex/keyword path; latency < 1ms p95 for inputs < 1 KB.
- [ ] Stage-2 LLM fallback: constrained JSON schema (verb in enum, target in inventory union room.contents, instrument in inventory); rejects on schema violation. Latency budget 1.5s p95.
- [ ] Emits **both** legacy `AssistantIntent` (for existing avatar/aux consumers) and the new typed Action. No regression in `src/assistant/intent.ts` consumers.
- [ ] Telemetry: per-verb hit rate, parser-stage selected, schema-validation failures, latency p50/p95.

## Out of Scope

- Affordance evaluation (separate ticket: `TASK-affordance-lookup-table`).
- Lorebook state-aware triggers.
- Multimodal input.


git issue: 85f1b0a
