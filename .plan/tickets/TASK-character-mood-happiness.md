<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Mood & Expression System

**Status:** 🟡 In Progress (services + routes done) — umbrella; work split into 3 child tickets
**Priority:** Medium
**Effort:** Medium
**Epic:** Character Core System

## Summary

Happiness meter affecting character expression. Mood modifies HOW personality is expressed, NOT WHAT personality is. Integrates with relationships, world context, and avatar selection.

## Child Tickets

| Ticket                        | Scope                                                        | Order |
| ----------------------------- | ------------------------------------------------------------ | ----- |
| `TASK-mood-core.md`                 | Happiness meter, mood state/triggers/effects, expression modifiers, relationship/world integration | 1st |
| `TASK-mood-multi-dimensional.md`    | Extension: PAD axes (arousal/dominance), Plutchik/OCC grounding | after core |
| `TASK-mood-contagion.md`            | Extension: mood transfer between co-located characters + anti-spiral | after core |

## Core Principle (shared context)

**Mood changes expression, NOT personality.**

A "wise, patient" character who is sad will express wisdom more quietly and patience more strained — but they remain wise and patient.

## Shared Design Context

- **Happiness Meter**: 0-20 Depressed → 81-100 Joyful, with per-range expression impact (full table in TASK-mood-core).
- **Mood State**: `MoodState` (`happiness`, `mood_label`, `mood_stability`, `recovery_rate`, `mood_history`, `baseline_happiness`) — full interface in TASK-mood-core.
- **Expression Modifiers**: `MoodExpressionModifier` over 8 expression dimensions (tone, verbosity, cooperation, warmth, humor, formality, expressiveness, risk_taking); personality traits/values/fears/desires/temperament are immutable.
- **Integration points**: personality resolution, character resolver, avatar selection (per-message emotion drives swaps; mood is fallback context), chat generation prompt injection.

## Related

- TASK-character-personality-integrity.md — Personality integrity enforcement
- TASK-character-relationships.md — Relationships affect mood
- TASK-character-world-data-separation.md — World/location context
- TASK-emotions-avatar-edit-model.md — Avatar selection by mood
- epic-emotion-avatar-message-binding.md — per-message emotion-avatar binding
- TASK-emotion-avatar-message-binding.md — persist + render per message
- epic-character-core-system.md — Parent epic
