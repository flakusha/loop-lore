<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: chat carryHistory: skipped ciphertext messages orphan all descendants

**Status:** ✅ Resolved (batch 2)
**Priority:** high
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

## Observed

carryHistory processes messages in created_at order. When a message is ciphertext-only (key_id set, content_plaintext null) it is skipped via `continue` at line 51. The idRemap.set(m.id, newId) call at line 82 happens AFTER the continue, so the skipped parent's id is never added to idRemap. Every child of that parent computes parentId = idRemap.get(m.parent_id) ?? null and receives null, severing the conversation tree.

## Expected

Skipped (undecryptable) parent messages should still record their old-id → new-id mapping in idRemap so descendant carries correctly re-parent to a known node (or be cut off cleanly without corrupting unrelated children).

## Evidence

- src/chat/service/carry-history.ts:48-82 — newId is computed at line 48, parentId reads idRemap at line 49, then line 50-52 `continue` skips the insert and the idRemap.set at line 82 never runs for that row.
- reproduction: call carryHistory on a chat whose source tree has a ciphertext-only message (key_id set, content_plaintext null) anywhere except as the deepest leaf. The carried chat's messages lose their parent_id chain — children become roots with parent_id = null.
- Existing test src/chat/service/carry-history.test.ts (if present) does not exercise this case; no assertion checks that descendants of a skipped message retain parent linkage.

## Severity

high

## Fix direction

Move `idRemap.set(m.id, newId)` to BEFORE the undecryptable guard so the parent→new-id link is preserved even when the row is dropped. Insert is skipped (per the documented key-id fix) but the idRemap entry is recorded. Alternatively, track skipped rows separately and cut off children of skipped parents explicitly (orphan cull).


## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
