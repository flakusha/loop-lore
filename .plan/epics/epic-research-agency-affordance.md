<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-AGENCY-AFFORDANCE: Verb x Target x Context Affordance Layer

**Status:** Draft
**Priority:** High
**Effort:** Medium
**Type:** Research epic (drives implementation tickets)
**Source:** `docs/research/interaction-systems-agency.md` section 4
**Related:** `src/regex/intent.ts` (keyword router - to be superseded), `src/services/actor-items.ts`, `src/routes/actor-items/`, `epic-aux-enrichment-pipeline.md`, `src/characters/services/character-systems/`

## Summary

Turn free-form user text into a typed `Action { verb, target, instrument, context }` payload, then resolve whether the action is **afforded** by the actor's capabilities x the item's properties x the current context state. Replace the current keyword-routing intent layer (`src/regex/intent.ts` + `src/assistant/intent.ts`) with a two-stage parser:

1. **Stage 1 (deterministic):** regex/keyword first-pass covers ~85% of common verbs at <1ms. Auditable.
2. **Stage 2 (constrained LLM fallback):** for novel inputs, call the configured LLM with a JSON schema (`verb` in closed enum, `target` in `inventory U room.contents`, `instrument` in `inventory`); reject if schema invalid.

Then evaluate `(actor_caps, item_props, context_state) -> AffordanceResult { allowed: boolean, reason: string }` so unsupported actions are *explained*, not silently dropped.

## Acceptance Criteria

- [ ] Closed verb enum covers the action space of `actor_items` + canonical verb set (`use, equip, unequip, drop, give, take, open, close, read, examine, attack, defend, talk, move, hide, search`); extensible.
- [ ] Stage-1 parser: regex/keyword, latency < 1ms p95 for inputs < 1 KB.
- [ ] Stage-2 LLM fallback: constrained JSON schema; model chosen via existing `resolveModelRole`; latency budget 1.5s p95.
- [ ] Affordance lookup table: `(actor_caps, item_props, context_state) -> boolean + reason`. Hook into `ActorItemsService.equip/unequip/transfer` and any other verb resolvers.
- [ ] Telemetry: per-verb hit rate, parser-stage selected, affordance denial rate.
- [ ] No regression in existing `INTENT_PATTERNS` consumers (avatar intent detection, etc.) - emit `AssistantIntent` alongside the new typed action.

## Work Items (Lazy Ladder)

1. **`TASK-affordance-action-parser`** — verb enum + two-stage parser + emit typed Action. P0. 2-3 days.
2. **`TASK-affordance-lookup-table`** — `(actor_caps, item_props, context_state) -> boolean + reason`. Hook into equip/use paths. P0. 1-2 days.

## Out of Scope

- Lorebook state-aware triggers (separate epic; defer until parser + lookup are real).
- VLM-based scene understanding (text-first loop-lore).
- LLM fine-tuning for verb resolution (constrained-schema fallback is sufficient; revisit when telemetry shows a gap).
- Multimodal item manipulation (item visuals are descriptive, not pixel-precise).
