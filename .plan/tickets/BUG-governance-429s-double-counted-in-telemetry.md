<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: governance 429s double counted in telemetry

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Resolved:** 2026-09-26 — landed in c860a74b2. Verified by `src/routes/v1/governance.test.ts:73` ("throttled request produces exactly one telemetry increment"). Ticket flagged stale (filed same day after merge).

**Summary:** Elysia runs onAfterHandle when a beforeHandle hook returns a response (node_modules/elysia/dist/compose.js:764-785), so a 429 produced in onBeforeHandle is recorded once explicitly there and again by the onAfterHandle telemetry hook — inflated 429 counts. Fix: mark governance-produced responses (symbol/header) and skip the second count. Verify: unit test with a throttled request asserting a single telemetry record.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete (c860a74b2)
- [x] Tests passing (`src/routes/v1/governance.test.ts:73`)
- [x] Verification command from ticket executed green
