<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Rule System — Enforcement, Messages Review, Rule Definitions

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Low
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Define a first-class RPG rule system: declarative rule definitions, an enforcement pipeline that validates chat actions against active rules, and a message-review surface that surfaces rule outcomes back to participants and the GM. Rules must drive prompt-template selection and modify the turn-manager behaviour.

## Acceptance Criteria

- [ ] Rule definitions live in `src/chat/service/party.ts` (or extracted module) and are addressable by id
- [ ] Enforcement pipeline rejects or annotates actions that violate active rules
- [ ] Rule outcomes are surfaced to participants via chat annotations and to GM via the review surface
- [ ] Prompt templates (`src/generation/prompt-templates/profiles.ts`) reflect active rules
- [ ] Turn manager respects rules (e.g. rule-driven skip, talkativity modifier)
- [ ] Rule definitions are versioned and hot-reload safe

## Related Tickets / Epics

- epic-chat-product-features
- epic-rpg-mechanics
- epic-rpg-core-wiring
- TASK-rpg-chat-questions
- TASK-rpg-check-chat-command-with-modifier-breakdown

## Files

- `src/chat/service/party.ts`
- `src/chat/service/party-narration.ts`
- `src/group-chat/turn-selector.ts`
- `src/generation/prompt-templates/profiles.ts`
- `src/generation/prompt-templates/templates.ts`

## Open Questions

- Are rules declarative (JSON-ish) or programmatic (TS)?
- Does the system ship with a default ruleset, or is it user-supplied?

