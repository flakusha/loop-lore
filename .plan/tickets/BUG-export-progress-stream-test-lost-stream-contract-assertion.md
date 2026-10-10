<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: export progress stream test lost stream contract assertion

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** After moving the seam to mock.module (c43c5f263) the test no longer asserts stream:true is passed (captured.signal===undefined is tautological since startExport never passes a signal) so dropping the stream flag or regressing to response.text() buffering passes. Fix: assert captured.stream === true in src/frontend/alpine/export-progress.stream.test.ts. Verify: temporarily remove stream:true from startExport and confirm the test fails.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete. — landed in `fix: resolve 13 week-review BUG tickets` (97e26cd02, 2026-09-26), which added `expect(captured?.stream).toBe(true)` to `src/frontend/alpine/export-progress.stream.test.ts`. The ticket status was left at `Not Started` after that.
- [x] Tests passing. — the assertion is non-tautological: `startExport` passes `{ method: "POST", stream: true }` to `apiFetch`, so the captured `RequestInit` carries `stream` only if the flag survives to the request layer.
- [x] Verification command from ticket executed green. — re-verified independently 2026-09-30 rather than taken on the earlier session's word: `bun test src/frontend/alpine/export-progress.stream.test.ts` passes; removing `stream: true` from `startExport` makes it fail with `Expected: true, Received: undefined` at line 91, and restoring the flag returns the file to its original hash. The assertion is load-bearing.
