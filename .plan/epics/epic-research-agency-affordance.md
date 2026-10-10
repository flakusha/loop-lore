<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-AGENCY-AFFORDANCE: Verb x Target x Context Affordance Layer

**Status:** In Progress
**Status Note:** parser + affordance lookup shipped (see Current State); open: production Stage-2 wiring, telemetry counters, latency budget measurement, loot budget-gate battle wiring (TASK-loot-budget-affordance-gate).
**Priority:** High
**Effort:** Medium
**Type:** Research epic (drives implementation tickets)
**Source:** `docs/research/interaction-systems-agency.md` section 4
**Related:** `src/regex/intent.ts` (keyword router - still live), `src/regex/action-parser.ts`, `src/services/affordance/`, `src/services/actor-items.ts`, `src/services/actor-items/`, `src/routes/actor-items/`, `epic-aux-enrichment-pipeline.md`, `src/characters/exporters/character-systems.ts`

**Tags:** research, agency, affordance, parser, action

**Overview:**

## Summary

Turn free-form user text into a typed `Action { verb, target, instrument, context }` payload, then resolve whether the action is **afforded** by the actor's capabilities x the item's properties x the current context state. Replace the current keyword-routing intent layer (`src/regex/intent.ts` + `src/assistant/intent.ts`) with a two-stage parser:

1. **Stage 1 (deterministic):** regex/keyword first-pass covers ~85% of common verbs at <1ms. Auditable.
2. **Stage 2 (constrained LLM fallback):** for novel inputs, call the configured LLM with a JSON schema (`verb` in closed enum, `target` in `inventory U room.contents`, `instrument` in `inventory`); reject if schema invalid.

Then evaluate `(actor_caps, item_props, context_state) -> AffordanceResult { allowed: boolean, reason: string }` so unsupported actions are *explained*, not silently dropped.

## Acceptance Criteria

- [x] Closed verb enum covers the action space of `actor_items` + canonical verb set (`use, equip, unequip, drop, give, take, open, close, read, examine, attack, defend, talk, move, hide, search`); extensible.
- [ ] Stage-1 parser: regex/keyword, latency < 1ms p95 for inputs < 1 KB. (Parser ships and is pure regex; no p95 latency benchmark exists — unmeasured, not claimed.)
- [ ] Stage-2 LLM fallback: constrained JSON schema; model chosen via existing `resolveModelRole`; latency budget 1.5s p95. (`Stage2LLMFn` injection point ships in `parseAction`; no production caller wires it to `resolveModelRole` yet.)
- [x] Affordance lookup table: `(actor_caps, item_props, context_state) -> boolean + reason`. Hook into `ActorItemsService.equip/unequip/transfer` and any other verb resolvers.
- [ ] Telemetry: per-verb hit rate, parser-stage selected, affordance denial rate.
- [x] No regression in existing `INTENT_PATTERNS` consumers (avatar intent detection, etc.) - emit `AssistantIntent` alongside the new typed action.

## Work Items (Lazy Ladder)

1. **`TASK-affordance-action-parser`** — verb enum + two-stage parser + emit typed Action. P0. 2-3 days. **Done.**
2. **`TASK-affordance-lookup-table`** — `(actor_caps, item_props, context_state) -> boolean + reason`. Hook into equip/use paths. P0. 1-2 days. **Done.**

## Current State (2026-10-10)

Shipped, verified in-tree (185 tests green across `src/services/agency/`, `src/characters/services/personality-service/`, `src/services/affordance/`, `src/services/loot/`, `src/regex/action-parser.test.ts`):

- `src/regex/action-parser.ts` — `VERB` closed enum + `VERB_VALUES`, `parseAction` (Stage-1 regex with optional Stage-2 `Stage2LLMFn` fallback), `parseActionStage1`, `actionToLegacyIntent` (emits `AssistantIntent` + target + confidence). Tests: `src/regex/action-parser.test.ts`.
- `src/services/affordance/lookup.ts` — `AffordanceResult { allowed, reason, missing? }`, `evaluate(actorCaps, itemProps, ctx, verb)` guard matrix keyed by `src/services/affordance/categories.ts` `CATEGORIES`. Tests: `src/services/affordance/lookup.test.ts`.
- Wiring: `src/services/actor-items/affordance.ts` (adapter consumed by equip path), `src/services/actor-items.ts` (`equip` accepts `actorCaps`/`context` opts), `src/services/loot/budget-gate.ts` (`enforceLootBudget` uses the same lookup; battle-path wiring still open under `TASK-loot-budget-affordance-gate`).
- `TASK-loot-budget-affordance-gate` links here as parent (P2, In Progress): it is a genuine consumer of the affordance lookup (party-capability gate), not a mis-link, but it is a follow-on work item beyond the original two in the ladder.

## Out of Scope

- Lorebook state-aware triggers (separate epic; defer until parser + lookup are real).
- VLM-based scene understanding (text-first loop-lore).
- LLM fine-tuning for verb resolution (constrained-schema fallback is sufficient; revisit when telemetry shows a gap).
- Multimodal item manipulation (item visuals are descriptive, not pixel-precise).


git issue: 60aa5a5
