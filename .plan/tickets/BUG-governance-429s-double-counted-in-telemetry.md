<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: governance 429s double counted in telemetry

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** Elysia runs onAfterHandle when a beforeHandle hook returns a response (node_modules/elysia/dist/compose.js:764-785), so a 429 produced in onBeforeHandle is recorded once explicitly there and again by the onAfterHandle telemetry hook — inflated 429 counts. Fix: mark governance-produced responses (symbol/header) and skip the second count. Verify: unit test with a throttled request asserting a single telemetry record.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
