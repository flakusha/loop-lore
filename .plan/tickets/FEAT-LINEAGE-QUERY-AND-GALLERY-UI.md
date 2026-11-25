<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# FEAT: Lineage query and gallery UI

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)
**Effort:** (none captured)

**Status:** Not Started
**Priority:** medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue 0f6a9ee.

git issue: 0f6a9ee

## Research addendum (2026-11-25)

- Lineage UI consumes `source_asset_id` and derived-variant records already present in the shared asset shape; one filter evaluator should serve both web and egui.
- 3D/glTF nodes enter lineage only after shared model classification lands; no browser-specific lineage store.
- Evidence: `.tmp/research/dcc-libraries/README.md` and `.tmp/research/gallery-3d-preview/README.md`. No new ticket is filed.
