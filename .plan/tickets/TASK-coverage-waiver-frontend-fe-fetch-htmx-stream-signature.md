<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: frontend fe-fetch + htmx below 75% floor (stream signature-only diff)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Priority:** Low
**Effort:** Small
**Epic:** epic-testing-qa

## Summary

The SSE streaming fix (safe-fetch `stream` option) threads a `stream?: boolean` through `feFetch` and `apiFetch` only — signature widening plus one early-return in `feFetch`, no new branch to unit-test. The substantive change lives in `src/utils/safe-fetch/fetch.ts`, which passes at 94.8% (floor 80) in the diff gate. The two frontend files it touches are DOM-bound (document listeners, `localStorage`, `document.cookie`) and fall below the 75% module floor in diff-file mode: `htmx.ts` 29.75%, `fe-fetch.ts` 62.3%. Per-file waivers floor them under measured until the Playwright DOM-coverage harness lands.

## Acceptance Criteria

- [ ] Per-file waivers in `scripts/check/coverage.mjs` (`frontend:src/frontend/htmx.ts`, `frontend:src/frontend/fe-fetch.ts`)
- [ ] Diff-file coverage gate green
- [ ] Documentation updated

## Coverage evidence (2026-10-23)

- file: src/frontend/fe-fetch.ts
  - module scope: src/frontend (every test under the top-level module)
  - LF=61, LH=61 -> 100.0%
  - floor after deletion: 75 (the `frontend` module waiver) — PASS
  - the per-file waiver `frontend:src/frontend/fe-fetch.ts` (floor 60) was
    deleted from `scripts/check/coverage/waivers.mjs`.

- file: src/frontend/alpine/htmx.ts
  - module scope: src/frontend (every test under the top-level module)
  - LF=142, LH=123 -> 86.6%
  - floor after deletion would be: 75 (the `frontend` module waiver) — PASS
  - the per-file waiver `frontend:src/frontend/alpine/htmx.ts` (floor 30) is
    KEPT by this change (out of its scope), but its recorded reason
    ("30.3 measured") is stale and it cites a Done ticket, so the next
    waiver-hygiene pass should delete it.

The ticket stays open: one of the two per-file waivers it owns is still live.
