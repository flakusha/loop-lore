<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: chat reunite: copyMessagesToPrimary carries source chat key_id verbatim

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

copyMessagesToPrimary (used by reuniteChats) inserts each secondary message with `key_id: msg.key_id` at line 156, preserving the source secondary chat's encryption key reference. carry-history.ts explicitly nulls key_id with a BUG-* comment explaining the dangling-FK risk; copyMessagesToPrimary does NOT apply the same fix.

## Expected

key_id should be nulled on copy (matching carryHistory) so reads in the reunited primary chat resolve content_plaintext instead of touching a chat_keys row owned by the secondary.

## Evidence

- src/chat/service/split-utils.ts:156 — `key_id: msg.key_id` verbatim copy.
- src/chat/service/carry-history.ts:62 — the documented correct pattern (`key_id: null` with BUG-carryhistory-copies-key-id comment).
- reproduction: split a chat, reunite, then archive/delete the secondary chat. Every encrypted message in the reunited primary chat throws 'Chat key not found' on read.

## Severity

medium

## Fix direction

Change line 156 to `key_id: null`. This aligns copyMessagesToPrimary with carry-history's documented fix and removes the dangling chat_keys FK.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
