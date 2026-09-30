<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: export progress stream test lost stream contract assertion

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** After moving the seam to mock.module (c43c5f263) the test no longer asserts stream:true is passed (captured.signal===undefined is tautological since startExport never passes a signal) so dropping the stream flag or regressing to response.text() buffering passes. Fix: assert captured.stream === true in src/frontend/alpine/export-progress.stream.test.ts. Verify: temporarily remove stream:true from startExport and confirm the test fails.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
