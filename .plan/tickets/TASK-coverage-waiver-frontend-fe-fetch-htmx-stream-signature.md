<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: frontend fe-fetch + htmx below 75% floor (stream signature-only diff)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Low
**Effort:** Small
**Epic:** epic-testing-qa

## Summary

The SSE streaming fix (safe-fetch `stream` option) threads a `stream?: boolean` through `feFetch` and `apiFetch` only — signature widening plus one early-return in `feFetch`, no new branch to unit-test. The substantive change lives in `src/utils/safe-fetch/fetch.ts`, which passes at 94.8% (floor 80) in the diff gate. The two frontend files it touches are DOM-bound (document listeners, `localStorage`, `document.cookie`) and fall below the 75% module floor in diff-file mode: `htmx.ts` 29.75%, `fe-fetch.ts` 62.3%. Per-file waivers floor them under measured until the Playwright DOM-coverage harness lands.

## Acceptance Criteria

- [ ] Per-file waivers in `scripts/check/coverage.mjs` (`frontend:src/frontend/htmx.ts`, `frontend:src/frontend/fe-fetch.ts`)
- [ ] Diff-file coverage gate green
- [ ] Documentation updated