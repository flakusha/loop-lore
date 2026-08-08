# FEAT: Message Swipe & Replay Branch (Regenerate / Retry Generation)

**Status**: open
**Priority**: medium
**Labels**: chat, messages, swipe, regenerate, replay, branch, llm
**Assignee**:
**Epic**: epic-messages
**Related**: TASK-quick-regen-button, docs/spec/messages.md,
docs/frontend/chat/message-actions.md, docs/frontend/chat/message-bubbles.md,
.plan/epics/epic-config-templates.md, FEAT-chat-template-config-lifecycle

## Description

The **swipe / regenerate / replay-branch** mechanic: regenerate a generated message and keep
the old one as an alternative **variant** (a sibling sharing the same `parent_id`), letting the
user flip between alternatives at any fork position in the message tree. This is the core
"retry generation" UX that is currently **missing a plan ticket** even though the data model,
API, and docs already exist.

Two related capabilities, both in scope:

1. **Regenerate the latest LLM message** — one-click retry of the most recent assistant/
   character message with the same context (optionally different temperature/model/max_tokens).
2. **Regenerate a previous message → new replay branch** — pick a message anywhere in the
   tree, regenerate it, and create a **new variant** at that fork position. The active timeline
   (client-side flatten) then walks the new branch forward; the old branch remains as an
   alternative swipe.

## Current State (verified)

The infrastructure already exists in code and docs; only the plan + some wiring is missing:

| Piece                                           | Status | Location                                                   |
| ----------------------------------------------- | ------ | ---------------------------------------------------------- |
| Message tree model (`parent_id` siblings)       | ✅     | `docs/spec/messages.md` §Message Tree Traversal            |
| `swipe_index` column                            | ✅     | `src/db/` messages schema                                  |
| Variant listing                                 | ✅     | `getMessageVariants` `src/chat/service.ts:720`             |
| Variant selection by index                      | ✅     | `selectVariant` `src/chat/service.ts:738`                  |
| Variant info on list                            | ✅     | `variantIndex`/`totalVariants` `src/chat/service.ts:712`   |
| `GET /api/messages/:id/variants`                | ✅     | `docs/spec/messages.md` §API                               |
| Swipe UI spec (swipe left/right, counter `2/4`) | ✅     | `docs/frontend/chat/message-bubbles.md`                    |
| Regenerate action (variant-aware)               | ✅     | `docs/frontend/chat/message-actions.md` (P1 table, row 11) |
| Regen last-message ticket                       | ✅     | `TASK-quick-regen-button.md`                               |
| **Plan ticket for swipe/replay-branch**         | ❌     | **This ticket**                                            |

## Proposed Mechanics

**Regenerate latest message** (already scoped in `TASK-quick-regen-button.md`):

- `POST /api/chats/:id/regenerate` → archives original, generates replacement.
- Only last AI message; author/owner only; idempotent; optional overrides.

**Regenerate previous message → new replay branch** (the gap this ticket closes):

- `POST /api/messages/:id/regenerate` → creates a **new sibling variant** (same `parent_id`,
  `swipe_index = max+1`) rather than mutating/archiving the original.
- The active-timeline flatten algorithm (`docs/spec/messages.md` §Active Timeline) picks the
  new variant as active; old branch stays as an alternative swipe.
- Descendant messages of the regenerated message are **not** carried to the new branch by
  default; the new branch starts fresh from the regenerated message (user can continue from
  there). Optional `carryDescendants: true` to replay the subtree.
- Variant counter increments (`2/4 → 3/4`); UI swipe left/right cycles, swipe right on last
  variant requests a new generation.

**Online-chat tie-in** (per `.plan/epics/epic-config-templates.md`): swipe/replay is a
**session-state** operation — it does not mutate key mechanics, so it is always allowed on an
online chat. Regenerate overrides (temperature/model) are per-request, not bound mechanics.

## Acceptance Criteria

- [ ] `POST /api/messages/:id/regenerate` creates a new sibling variant (not a mutation)
- [ ] `swipe_index` increments; old variant preserved as alternative
- [ ] Active-timeline flatten selects the new variant; old branch reachable via swipe
- [ ] Regenerate latest message works via `TASK-quick-regen-button` mechanics
- [ ] Optional `carryDescendants` replays the subtree under the new branch
- [ ] Permission check (author/owner); idempotency (no concurrent regen)
- [ ] UI: variant counter updates, swipe left/right cycles, swipe-right-on-last requests new gen
- [ ] Online chat allows swipe/replay (session-state op); no key-mechanic mutation
- [ ] Tests: variant creation, flatten with new branch, counter, idempotency

## Files

- `src/routes/chat-regenerate.ts` (new) or extend `src/routes/messages.ts` — regenerate endpoint
- `src/chat/service.ts` — `regenerateMessageVariant` (reuse `getMessageVariants`/`selectVariant`)
- `src/frontend/alpine/chat.ts` — swipe state, variant switching, regenerate request
- `src/components/chat/message-bubbles.html` — variant counter + swipe handlers
- `docs/frontend/chat/message-bubbles.md` — confirm swipe/replay behavior (already spec'd)

## Notes

- `epic-messages.md` is currently an empty TBD — this ticket is its first concrete task.
- Distinct from `TASK-quick-regen-button.md` (regenerate last message, archive-original flow);
  this ticket covers **previous-message replay branches** + the variant/swipe system.
- Data model, API, and UI spec already exist — this is primarily **wiring + plan**, low design risk.
