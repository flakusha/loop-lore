<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: alpha extraction matting job for opaque character images

**Status:** ⬜ Not Started
**Priority:** high
**Epic:** Avatar Alpha Channel + VN Layering; Aux Enrichment Pipeline
**Effort:** Medium

## Summary

Implement the matting fallback from epic-avatar-alpha-vn-layering: aux-pipeline background-removal job (pluggable model/provider) producing a matted RGBA derivative asset linked to the raw (re-runnable when better models land); job status surface; has_alpha computation at store time; raw stays usable when matting fails. Complements provider-side transparency requests. Acceptance: job lifecycle tests (success/fail/re-run), asset pair linking, alpha detection tests (png rgba, webp vp8l), schema regen gates green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
