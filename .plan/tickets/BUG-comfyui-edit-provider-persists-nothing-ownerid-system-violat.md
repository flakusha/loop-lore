<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: ComfyUI edit provider persists nothing: ownerId 'system' violates assets.owner_id FK

**Status:** Done
**Priority:** high
**Effort:** Medium

**Epic:** epic-asset-platform-capabilities

**Summary:**

src/image-edit/providers/comfyui-provider.ts:183 hardcodes ownerId: "system", but assets.owner_id is NOT NULL references users.id (src/db/migrations/001_init.ts:408) and the canonical system user id is "system-user" (SYSTEM_USER_ID, src/characters/seed/avatar.ts:64). Verified 2026-10-01 on dev: createAsset({ownerId:"system"}) throws SQLiteError FOREIGN KEY constraint failed (errno 787). The ComfyUI image-edit provider therefore cannot persist a result at all.

The prior fix for BUG-generated-images-owned-by-system-are-invisible-to-the-reques threaded userId into src/generation/image-gen-route.ts:166 but did not touch the image-edit provider.

Fix: call ensureSystemUser(database) (already used by src/characters/seed/templates.ts:225) instead of the literal, or thread the requesting userId through. Note the FK is the immediate failure; the system-owner dedup collapse is tracked separately in BUG-asset-dedup-collapses-all-users-into-one-row.

Acceptance: a ComfyUI edit run persists its output assets; no createAsset call in the provider passes a literal ownerId that is absent from users.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Verified fixed by code reading and focused tests against dev:

- The literal `ownerId: "system"` at comfyui-provider.ts was changed to `ownerId: opts.ownerId`, threading the authenticated requesting user through to `createAsset`.
- The route handler that calls the provider already has the authenticated user in scope, so the ownerId passed is always a valid `users.id`.
- Pinned by `src/image-edit/providers/comfyui-owner.test.ts`, which runs a full provider invocation with a real ownerId and verifies the resulting asset row is persisted and readable.
