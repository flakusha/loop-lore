<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Entry Field — Pre-Send History Buffer & Send-Blocking by Turn Rules

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low
**Epic:** epic-chat-product-features

## Summary

The chat entry field must keep a browser-side history of drafts and must disable / block the `send` button when turn rules disallow the current actor from speaking. The history survives reload and respects the active chat's permissions.

## Acceptance Criteria

- [ ] Drafts are persisted in browser storage and restored on reload
- [ ] Send button is disabled while turn rules disallow the current actor
- [ ] Tooltip / aria message explains why `send` is blocked
- [ ] Mentions and asset references are validated pre-send via `src/group-chat/mention-parser.ts`
- [ ] No network round-trip is required to disable the button — the gate uses client-known state
- [ ] Unit / Alpine coverage exercises draft restoration, send blocking, and re-enable paths

## Related Tickets / Epics

- epic-chat-product-features
- TASK-no-browser-test-chat-panels-mood-avatars
- TASK-no-browser-test-chat-streaming-message-lifecycle

## Files

- `src/components/chat/` — input surface (browser-side)
- `src/group-chat/mention-parser.ts`
- `src/turning/turn-manager/state.ts`

## Open Questions

- How long do drafts live before expiry?
- Should drafts be encrypted at rest in browser storage?

