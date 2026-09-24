<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message Continuation, Auto-Continue & AI-Drafted User Turn

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Ticket
**Tags:** chat, feature, continuation, generation, turn
**Epic:** epic-chat-product-features

## Summary

Three generation affordances observed in comparable platforms and absent here (research 2026-09-11): (a) **Continue** — ask the model to extend its own last message in place; (b) **Auto-continue** — automatically continue when generation stops below a token floor (SillyTavern "Auto-Continue" precedent); (c) **AI-drafted user turn** — the model drafts the user's/character's next message for review before sending (SillyTavern "Impersonate" precedent). None of these are covered by `epic-impersonation`, which only injects a user persona into prompts.

## Acceptance Criteria

- [ ] Continue appends to the last assistant message in place (no new message row) and marks the message as continued
- [ ] Auto-continue is a per-chat setting with a configurable token floor; loops are bounded by a max-continuations cap
- [ ] Continued messages keep a single context position (no duplicated prompt fragments)
- [ ] AI-drafted user turn renders as a draft only; it never enters context or history until the user sends or edits it
- [ ] All three actions respect turn rules and moderation hooks (no bypass of the turn manager or NSFW gate)
- [ ] LLM-only validation variants (6/7) can enable auto-continue via `gm_config.validation` without user affordances

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-chat-feature-component-buttons` — Continue/draft affordances join the message action row
- `epic-impersonation` — user-persona injection; complementary, not overlapping
- `TASK-chat-feature-turn-talkativity-skip` — turn rules gate every draft action

## Files

- `src/generation/` — continuation prompt paths
- `src/chat/service/write.ts` — in-place message append
- `src/components/chat/` — action row + draft rendering

## Research Inputs

- SillyTavern Continue / Impersonate / Auto-Continue (deepwiki SillyTavern/SillyTavern, 2026-09-11)

## Open Questions

- Does an AI-drafted user turn consume a turn slot if discarded?
- Should auto-continue also apply to gm narration in guided variants?
