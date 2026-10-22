<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest asset public reads: open-public asset access

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-guest-access

**Summary:**

## Problem

canAccessAsset (src/assets/service/read.ts) requires a non-null actorId for public assets, so anonymous/guest requests fail by construction; visibleAssetFilter has the same shape.

## Change

- canAccessAsset / visibleAssetFilter gain an open-public branch: visibility=public readable with userId=null (guest context).
- Registered-public: any authenticated actorId can read public assets (existing behavior, now explicit).
- Shared (asset_shares) and owner branches unchanged.
- Raw/thumbnail bytes still served via the existing signed-URL path (src/assets/signed-url.ts).

## Acceptance

- Guest can list and fetch public assets (metadata + signed-URL bytes).
- Guest cannot fetch private/shared-only assets.
- Registered user public-asset reads unchanged.
- No actorId requirement leaks into the public branch.

**Context:**

`visibility=public` assets are now readable without an account: the shared asset guards take a nullable actor id and the public branch no longer requires one.

- `src/assets/service/read.ts`: `canAccessAsset` takes `actorId: string | null` and grants `AssetVisibility.Public` to any caller, including the synthetic guest tier (null actor id). The owner, `asset_shares` and admin branches are unchanged and still require a real actor id. `visibleAssetFilter` (and its gallery sibling `visibleGalleryAssetFilter`) take `string | null`; a null actor id is folded to `""`, which never equals a real id, so a guest's filter is exactly "public assets".
- Types widened to match: `src/search/types.ts` (`SearchScope` assets arm `userId: string | null`) and `src/search/convenience.ts` (`searchAssets`).
- The read surface needed no guard change: `src/assets/controller.ts` already forwarded `(ctx as any).userId ?? null` on the collection, single-asset, transform, raw, download, thumb, compressed and signed-url-mint reads, and `src/assets/serve-handlers.ts` (`resolveAsset`/`resolveForServe`) already took `actorId: string | null`. Verified unchanged: `src/routes/views/gallery.ts` (`applyGalleryAssetFilters` already folds a null actor id to `""`), `src/search/providers/assets.ts` (passes `scope.userId` straight into `visibleAssetFilter`).
- Raw/thumbnail bytes keep the existing signed-URL path (`src/assets/signed-url.ts`); a guest can mint a signed URL for a public asset because the mint route resolves through the same guard.

Why one guard per shared function: the asset read surface has exactly two decision points (`canAccessAsset` for a single asset, `visibleAssetFilter` for a list). Both were widened; no route-level duplicate was added, so an asset read cannot pass one filter and be refused by the other.

Rejected alternative: a per-route `allowGuest` flag like `WorldAccessOpts.allowGuest`. The asset read routes are already guest-reachable (they never called `requireUserId`) — they were only blocked by the shared guard's non-null actor id requirement, so a flag would have been a second mechanism for the same decision.

Rejected alternative: seeding a shared/owner row for the guest tier. Rejected — the guest context has no id to own or be shared with, and the public arm needs no row.

Mutation routes are untouched: PATCH/PUT/DELETE/LINK/SHARE still call `requireUserId` and the owner/share checks.

Tests: `src/assets/service/read.test.ts` (+4 — public asset readable with a null actor id, private and shared-only denied, list filter yields public-only for a null actor id, registered public reads unchanged). `bun test src/assets/service/read.test.ts` → 27 pass / 0 fail; `bunx tsc --noEmit` clean.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue 7b2b199 (registry tip: aa476013c Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GUEST-ASSET-PUBLIC-READS-OP)
