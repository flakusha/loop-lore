<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: HTTP-expose agency earn and status alongside spend

**Status:** Done — POST /api/agency/earn wired (src/routes/agency/earn.ts, registered in src/routes/agency/index.ts); GET /api/agency/balance already wired; both auth-gated.
**Priority:** medium
**Effort:** Small
**Epic:** epic-agency-story-points
**Tags:** agency, routes

**Summary:** Only POST /api/agency/spend is wired (src/routes/agency/); earn exists as CLI-only and GET status is missing. Add POST /api/agency/earn and GET /api/agency/status reading the existing story-points service, auth-gated.

**Context:** Verified 2026-09-26: src/routes/agency/ contains only index.ts + spend.ts; the story-points service supports earn/balance but has no HTTP surface for them.

**Acceptance Criteria:**

- [x] Earn+status round-trip via HTTP (test); spend unchanged. — earn.test.ts covers 401/403/200/422/400/world_id; balance.test.ts covers 401/200/zero-row/world_id
- [x] `bun run check` green.
