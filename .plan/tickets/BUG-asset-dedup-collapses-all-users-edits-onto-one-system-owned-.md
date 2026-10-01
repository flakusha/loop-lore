<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Asset dedup collapses all users' edits onto one system-owned row

**Status:** Not Started
**Priority:** critical
**Effort:** Large
**Epic:** epic-asset-platform-capabilities

**Summary:**

createAsset dedups on (content_hash, owner_id) only — src/assets/service/create.ts:53-54. Every ComfyUI image-edit result is owned by the same system user (comfyui-provider.ts:183), so once the FK is fixed, byte-identical output from any two users resolves to a single asset row. Verified 2026-10-01: two createAsset calls with ownerId=SYSTEM_USER_ID and identical bytes returned sameId=true, duplicate=true, 1 row.

The surviving row retains the FIRST user's asset_links (comfyui-provider.ts:194-207 links entityType chat/messageId). So user B's generated image is served inside user A's chat, and B's own chatId/messageId links are never written. This is a cross-tenant content-mixup, not merely a storage waste.

Also affects gallery uploads of identical bytes by different users: 2 rows and 2 files on disk (storage_path is per-assetId, src/assets/service/file-system.ts:65) — no cross-user dedup exists at all.

Root cause: the check is correct as an idempotency guard and wrong as a dedup mechanism — it cannot distinguish 'user re-uploads their own file' from 'this is iteration 2 of a derived asset'. Fix: ownership must not be a shared system identity on the write path (see BUG-comfyui-edit-provider-persists-nothing-ownerid-system-violat), and dedup must be scoped per (owner, encryption_tier, key_id) per BUG-asset-dedup-ignores-requested-encryption-tier.

Acceptance: two users generating byte-identical images get two distinct asset rows; each row's asset_links reference only its own creating user's chat/message; deleting one row leaves the other serving correctly.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
