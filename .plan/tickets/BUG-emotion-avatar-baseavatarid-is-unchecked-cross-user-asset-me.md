<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Emotion-avatar baseAvatarId is unchecked: cross-user asset metadata leaks into generated prompts

**Status:** Wontfix
**Priority:** high
**Effort:** Medium

**Summary:**

The emotion-avatar generation routes accept a caller-supplied baseAvatarId / base_avatar_id and never verify the caller may read that asset. extractAvatarMetadata (src/characters/services/emotion-avatar-fallback.ts:65-131) calls getAsset(db, assetId) with NO owner check, so any asset id belonging to another user is read and its alt_text, caption, tags, and dimensions are folded into the generated prompt.

Affected entry points, both reachable by an authenticated caller who owns only the actor/item:
- src/routes/character-emotion-avatars.ts:91-139 (POST actors/:actorId/emotion-avatars) - checks actor ownership at :95, then trusts body.baseAvatarId at :104 with no asset check
- src/routes/wardrobe-avatars.ts:55-95 and :80-100 (outfit + single-slot generation) - checks wardrobe item ownership, trusts body.base_avatar_id

IDOR class: the asset id is the only input, and an unguessable id is not authorization.

Confirmed by execution, not by reading alone. A throwaway probe called extractAvatarMetadata with an asset owned by user B while passing user B's actorId, and got back the foreign asset's data:
  asset owner        : 4ebf357d-fd9d-4bf1-ad5f-b12dc6a0e1c6
  alt_text returned  : "BOB-SECRET-CAPTION"
  caption returned   : "BOB-SECRET-CAPTION"
The probe was deleted after the run; src/ and tests/ in the dev checkout are unmodified.

Contrast with the correct pattern already in the codebase: caption-route.ts:121 treats a foreign asset as not found, and MattingService.startMatting (src/generation/matting/service.ts:68) returns forbidden on owner mismatch. The asset layer already exposes canAccessAsset (src/assets/service/read.ts:223-247), which is default-deny and resource-level, so the fix has a helper to reuse.

Fix direction: check the base asset before use, reusing canAccessAsset or an owner comparison, and treat a foreign asset as not found rather than reading it. Cover both routes. Note this is a SEPARATE defect from the avatar PUT/DELETE route scoping fixed in fix-avatar-idor (commit 4118634d3) - do not conflate the two.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Resolution

ALREADY PREVENTED — the audit missed a load-bearing guard. Both entry points
converge on `EmotionAvatarService.startBatchGeneration`, which rejects a
foreign base avatar before any asset is read:

- `src/characters/services/emotion-avatar-service/index.ts:86-94` — loads the
  base avatar and throws `Base avatar does not belong to actor <id>` when
  `baseAvatar.actorId !== opts.actorId`. This runs before job creation
  (`:97`), so `extractAvatarMetadata` is never reached with a foreign id.
- `src/routes/character-emotion-avatars.ts:138-147` — enforces
  `checkActorOwnership` upstream (body at `src/routes/actor-auth.ts:90-97`),
  so the caller must already own the actor whose avatar is required.
- `src/routes/wardrobe-avatars.ts:52` — the converging route requires an owned
  wardrobe item, binding `actorId` to the caller's own asset before the service
  guard runs.

Pinned by an existing test:
`src/characters/services/emotion-avatar-service/index.test.ts:81-83` asserts
`rejects.toThrow("does not belong",)` when `startBatchGeneration` is called with
a random `actorId` and another actor's `baseAvatarId`.

The probe in the Summary called `extractAvatarMetadata` directly, bypassing the
service guard that every production entry point must cross. The described IDOR
is not reachable from any route. Wontfix rather than Done: the guard already
exists and is test-covered, so there is nothing to implement. The `canAccessAsset`
hardening remains a defence-in-depth option, not a fix for a live defect.
