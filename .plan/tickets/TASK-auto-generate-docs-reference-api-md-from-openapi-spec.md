<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Auto-generate docs/reference/api.md from OpenAPI spec

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

docs/reference/api.md (674 lines, hand-maintained) drifts from the real routes. Now that bun run openapi generates docs/reference/openapi.json, render api.md from the spec. Acceptance: new script (extend scripts/generate-openapi.ts or add scripts/generate-api-md.ts) writes api.md endpoint table (method, path, summary) with DO NOT EDIT banner; hand-written sections move to a separate companion file or clearly delimited region; check gate fails on stale api.md (regen + git diff --exit-code). Keep v1/v2 surfaces separable when v2 lands.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
