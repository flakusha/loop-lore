<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: feat(media): resumable media delivery with cache-manifest

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Derived-feature proposal F09 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-frontend-bundle-optimization.md` (Not Started) + `epic-asset-platform-capabilities.md` (In Progress) + `epic-gallery-batch-operations.md` (Not Started) + T12 (no-cache entry points, Range/206, non-blocking reads).

Derivation: T12 splits cache policy (immutable hashed assets vs no-cache HTML) and adds Range support to the static handler. A cache-manifest (which paths are immutable, which are entry points) plus resumable delivery for large media falls out of that split: the gallery/batch flows already move large files, and bundle optimization already needs the immutable set enumerated.

Draft epic sketch / acceptance:

- Static handler serves `Range`/`206` for media/asset paths and `no-cache` for `.html` entry points (T12 acceptance, restated as contract).
- Build emits a manifest of hashed-immutable paths consumed by both the server cache policy and the frontend bundle optimizer.
- Gallery batch download/export supports resume via Range (extends batch-operations epic, no new transport).
- Media-seek UX (audio/video position restore) works against the same Range support.
- A test asserts header policy per path class and 206 partial content for a byte range.

Priority: med — 60s staleness today is minor, but Range unlocks media seeking the asset platform already promises.

Blocked-by: T12.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). Medium-priority composition group F06-F09.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
