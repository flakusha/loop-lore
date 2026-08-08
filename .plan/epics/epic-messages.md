# EPIC: Messages & Message Pipeline

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** messages, pipeline, chat, persistence, retrieval

## Summary

Implementation epic for Messages & Message Pipeline. See `docs/spec/messages.md` for specification.

## Scope

Message tree model (`parent_id` siblings, swipe variants, continuations), variant/swipe
system, regenerate/replay-branch, and the message pipeline (persistence, retrieval, active
timeline flatten).

## Related Epics

- `docs/spec/messages.md`
- `docs/frontend/chat/message-bubbles.md` — variant switcher / swipe UI spec
- `docs/frontend/chat/message-actions.md` — Regenerate action (variant-aware)
- `.plan/epics/epic-config-templates.md` — swipe/replay is a session-state op (always allowed online)

## Tickets

- `FEAT-message-swipe-replay-branch.md` — swipe/regenerate/replay-branch mechanic (new variant per regeneration)
- `TASK-quick-regen-button.md` — regenerate latest message (archive-original flow)
