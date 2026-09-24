<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Entry Field — Pre-Send History Buffer & Send-Blocking by Turn Rules

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Low
**Effort:** Low
**Epic:** epic-chat-product-features

## Summary

The chat entry field must keep a browser-side history of drafts and must disable / block the `send` button when turn rules disallow the current actor from speaking. The history survives reload and respects the active chat's permissions.

## Acceptance Criteria

- [x] Drafts are persisted in browser storage and restored on reload
- [x] Send button is disabled while turn rules disallow the current actor
- [x] Tooltip / aria message explains why `send` is blocked
- [x] Mentions and asset references are validated pre-send via `src/group-chat/mention-parser.ts`
- [x] No network round-trip is required to disable the button — the gate uses client-known state
- [x] Unit / Alpine coverage exercises draft restoration, send blocking, and re-enable paths

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

