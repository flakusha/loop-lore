<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: governance 429 responses missing RateLimit Retry-After headers

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** Governance 429s do not set RateLimit / RateLimit-Remaining / Retry-After headers although policies.ts:13 documents the name as surfaced in RateLimit headers and the status endpoint. Clients cannot back off. Fix: set standard headers on throttle responses from the matched policy. Verify: unit test asserting headers on a throttled request.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
