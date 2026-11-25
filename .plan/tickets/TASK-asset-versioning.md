<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Asset Versioning System

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** Medium
**Epic:** epic-items
**Tags:** asset, versioning

## Summary

Implement asset versioning to track changes, enable rollbacks, and maintain history of asset modifications.

**Current state (2026-11-25):** no `asset_versions` table or `AssetVersion` symbol exists in `src;packages`; `dedupe: false` stores a NULL content hash at `packages/assets/src/assets/service/create.ts:39-51`, so current generated rows are not immutable versions of one logical asset. Amend this Not Started ticket before implementation, not alongside a second versioning ticket. Evidence: `.tmp/research/full-cycle-app-integrations-2026-11-25/strict-review.md` C16 and `dcc-and-closed-loop.md:215`.

## Requirements

### Identity and append-only versions

- A stable logical asset id is distinct from immutable content objects keyed by sha256. `asset_versions` is append-only: version id, content hash, schema version, size, dimensions, MIME and provenance (run id, branch id, story turn id, source/application + version, actor, created_at).
- Identical same-content ingest is idempotent: no second version and no hash-less row; a repeated restore returns the same version identity.
- The `assets.current_version_id` pointer moves only by conditional compare-and-swap against an expected previous version/hash in one transaction with the version insert. A losing writer keeps its bytes as an unselected candidate; it never overwrites the winner.
- Restoring a previous version creates a new immutable version whose provenance names the restored source; history and content objects are never rewritten.
- Migration and deterministic version ordering; negative paths cover wrong hash/version, duplicate submit, concurrent CAS and unauthorized actor.

### Browsing

- List all versions of an asset; view version details (diff, metadata); compare versions side-by-side.

### Deferred — outside the correctness slice

- Incremental/delta storage, compression of old versions and cleanup retention policies are deferred until version volume is measured.

<!-- ponytail: full-content versions only; add delta/compression once measured volume justifies it. -->

## Acceptance Criteria

- [ ] Migration creates append-only `asset_versions` (sha256 content object, schema version, provenance) and a `current_version_id` pointer guarded by CAS.
- [ ] Upload/re-ingest creates a version with complete provenance; identical same-content ingest creates no duplicate version.
- [ ] Version listing, detail/diff and side-by-side comparison work for immutable versions.
- [ ] Restore creates a new version with restore provenance; history and content objects are unchanged.
- [ ] Stale base-hash/version and concurrent pointer changes fail with a named conflict; the losing candidate is preserved and the current pointer is unchanged.
- [ ] Wrong hash, duplicate submit and unauthorized-actor paths are covered by tests.
- [ ] Unit tests for versioning logic and integration tests for the full version workflow pass.

## Notes

- Reference `epic-items.md` for asset system design
- Consider storage costs vs. version retention
- Balance version history vs. cleanup
