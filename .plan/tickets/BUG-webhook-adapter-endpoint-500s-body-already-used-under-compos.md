<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Webhook adapter endpoint 500s Body already used under composed v1 barrel

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

POST /api/v1/integrations/webhooks/:adapter returns 500 "Body already used" when routed through the composed v1 barrel (v1Routes from src/routes/v1/index.ts -> standalone-surface/integrations-surface). Cause: integrationsSurface reads raw request.text() for HMAC verification while the composed Elysia parse has already consumed the body. Standalone plugin tests miss it because no parse composition occurs there. A/B-verified pre-existing on dev base f3d4d42d4 (not introduced by the facade slice on epic-agentic-integration). Fix direction: webhook route needs parse:"none" + local body parse, following the documented pattern at src/elysia-app.ts:265-281 (POST /api/v1/assets) or a custom parser. Reproduce: NODE_ENV=test probe posting any body to /api/v1/integrations/webhooks/telegram through the real createApp.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
