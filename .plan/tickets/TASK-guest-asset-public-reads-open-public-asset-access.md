<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Guest asset public reads: open-public asset access

**Status:** Not Started
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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
