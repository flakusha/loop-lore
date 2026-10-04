<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: check runner gate label rename breaks check-parallel.gates.test.mjs

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** commit a190741b8 renamed gate label to 'frontend - banned patterns (ESLint-gap heuristic — non-blocking)' (scripts/check-parallel.mjs:322) but scripts/check-parallel.gates.test.mjs:82 still passes the old '— advisory' label; applyGateFilter exits 2 unknown gate name. Lives in scripts/ so the unit gate never catches it. Fix: update test label string and refresh stale gate-count assertions. Verify: bun test scripts/check-parallel.gates.test.mjs.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete
- [x] Tests passing
- [x] Verification command from ticket executed green
