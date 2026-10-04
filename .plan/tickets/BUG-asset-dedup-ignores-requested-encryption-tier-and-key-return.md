<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Asset dedup ignores requested encryption tier and key, returning an unencrypted row

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-asset-platform-capabilities

**Summary:**

The dedup lookup in createAsset filters on (content_hash, owner_id) only — src/assets/service/create.ts:53-54 — and ignores the encryption_tier and key_id the caller requested. The existing-row branch at create.ts:57-81 returns the stored row verbatim.

Verified 2026-10-01: a first upload stored tier=public key=null. A second call with the same owner, same bytes, and encryptionTier='chat', keyId='CHAT-B-KEY' returned duplicate=true, the same asset id, and tier=public key=null. An upload into an encrypted chat therefore silently receives the unencrypted row.

Impact: encrypted-chat media is served unencrypted, and the chat key that was derived for it (src/assets/controller.ts:543-553) is discarded. The duplicate:true response body (controller.ts:581-591) tells the client the upload succeeded.

Fix: include encryption_tier and encrypted_key_id in the dedup key, so a request whose encryption context differs does not match an existing row. Related: BUG-asset-dedup-collapses-all-users-edits-onto-one-system-owned- and BUG-new-edit-iterations-collapse-onto-an-existing-asset-row-inst.

Acceptance: an upload requesting tier=chat never returns a row whose encryption_tier differs; a row created for a different key_id is not reused; the public-tier idempotency guarantee (TASK-config-gallery-attachment-idempotent) still holds for same-tier re-uploads.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Verified fixed by code reading and focused tests against dev:

- The pre-read dedup lookup that bypassed encryption context was removed; the insert now arbitrates directly using `onConflict(...).doNothing()` with the full dedupe key including `encrypted_key_id`.
- When a conflict occurs, the loser re-reads on the same key as the conflict target, including `encrypted_key_id is null` for the public path, so the correct encryption context is returned.
- Pinned by `src/assets/service/create-dedup-race.test.ts`, which exercises concurrent uploads with mismatched encryption tiers and verifies each gets its own row with the correct tier and key.
