<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn send gate (block send/accept, allow edit)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

The turn system must block message send/accept (frontend AND backend) while a turn is not sendable — pending VN choice resolution, strict turn order (not-your-turn), paused cascade — but MUST NOT block editing: the LLM chat input stays refinable and frontend-stored pre-send state history (drafts, input versioning) keeps working. The send button goes inactive with a visible reason; the backend rejects with a machine-readable 409 + reason code.

Natural hook: new gate in src/routes/messages/create.ts between slash-command dispatch and storage prep, or inside maybeAutoReply before triggerAutoGeneration (covers user + auto uniformly). Pause precedent: story_state.isPaused checks in turn-selector + group-cascade.

## Acceptance Criteria

- [ ] Backend rejects send when turn state forbids it (409 + reason), edits/drafts unaffected
- [ ] Frontend send button inactive with visible reason; textarea and draft history editable
- [ ] Pending-choice, not-your-turn, and paused states each produce distinct reasons
- [ ] Blocked send offers skip as escape hatch (see TASK-turn-skip-gate-interlock)
- [ ] Tests passing
