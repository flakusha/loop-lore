<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: HTTP-expose agency earn and status alongside spend

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-agency-story-points
**Tags:** agency, routes

**Summary:** Only POST /api/agency/spend is wired (src/routes/agency/); earn exists as CLI-only and GET status is missing. Add POST /api/agency/earn and GET /api/agency/status reading the existing story-points service, auth-gated.

**Context:** Verified 2026-09-26: src/routes/agency/ contains only index.ts + spend.ts; the story-points service supports earn/balance but has no HTTP surface for them.

**Acceptance Criteria:**

- [ ] Earn+status round-trip via HTTP (test); spend unchanged.
- [ ] `bun run check` green.
