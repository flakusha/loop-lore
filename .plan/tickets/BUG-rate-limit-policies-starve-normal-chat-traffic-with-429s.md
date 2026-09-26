<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: rate limit policies starve normal chat traffic with 429s

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:** routePolicies maps EVERY /api/v1/chats* request to generationPolicy 20/min burst 5 (src/api-governance/rate-limiting/policies.ts:47-51): chat open fires >5 requests instantly (src/frontend/alpine/chat-messages.ts:43-66) and each send cycle costs 4-6, capping users at 3-4 exchanges/min. Seen-poller GETs per message every 5s (src/frontend/alpine/chat-seen.ts:26-29,94-101) sustains 429s on defaultPolicy 300/min at >=26 loaded messages, starving the shared default bucket. Solo-user mode funnels all traffic into one userId. Fix: size policies to measured UI volume, batch/exempt the per-message seen endpoint, key generation per chat or raise max, add a budget test from the real call pattern. Verify: open 50-message chat and watch /api/v1/rate-limit/status remaining drop to 0.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
