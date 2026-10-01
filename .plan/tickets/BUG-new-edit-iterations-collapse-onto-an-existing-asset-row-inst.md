<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: New edit iterations collapse onto an existing asset row instead of spawning a new item

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

Gallery/asset edits must spawn a new item rather than mutate in place, so a new iteration never inherits access already provisioned on the old one. The no-in-place-mutation half already holds — storage_path is written only at insert (src/assets/service/create.ts:143,166) and no code path rewrites stored bytes. But the dedup short-circuit at create.ts:31-81 immediately collapses the new row back onto a pre-existing one whenever the derived bytes happen to match.

Verified 2026-10-01: two createAsset calls, same owner, identical bytes, second with filename 'edit-abcd1234.png' and altText 'Edited: brighter' — result was 1 row, filename reverted to the original, the new alt_text discarded, and the new item inherited the old row's public visibility, so a stranger could read it via canAccessAsset.

Affected derivative-creating call sites: src/generation/image-edit-service/apply.ts:193, src/generation/matting/service.ts:182, src/assets/service/persist-generated.ts:50, src/generation/image-gen-route.ts:163.

Fix: do not apply the content-hash dedup on derivative-creating paths — an edit that reproduces existing bytes is still a distinct iteration and needs its own row, its own visibility, and its own share set. Keep the dedup for genuine re-uploads of the same file by the same user.

Acceptance: applying an edit whose output bytes match an existing asset creates a new row with its own id; the new row's visibility defaults to private regardless of the source row's visibility; the source row's shares are not copied to the new row; gallery shows both iterations as distinct items.

**Context:**

Fixed in commit 320aa05 by adding a `dedupe?: boolean` field to `CreateAssetInput` (defaults to true) and gating the content-hash lookup in `createAsset` on it. The upload path (src/assets/controller.ts) and template seeding (src/characters/seed/templates.ts) keep the default and still collapse a genuine re-upload of identical bytes. The five derivative-creating call sites pass `dedupe: false`: image-edit-service/apply.ts, matting/service.ts, persist-generated.ts (which also covers emotion-avatar generation), image-gen-route.ts, and image-edit/providers/comfyui-provider.ts.

Constraints: the dedup short-circuit also serves idempotency for re-imports and template seeding, so it must stay on by default rather than being inverted or removed. A required `dedupe` field would force every caller to state intent and re-litigate the decision each time; the documented default keeps the common upload path a one-word call and confines the flag to the paths where it means something.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
