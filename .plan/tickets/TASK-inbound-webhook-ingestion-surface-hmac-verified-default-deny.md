<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Inbound webhook ingestion surface (HMAC-verified, default-deny)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-integrations-core

**Summary:**

Adopted component: none (ground-up HTTP endpoint). Seam: src/routes/v1/integrations-surface.ts (new) — POST /api/v1/integrations/webhooks/:adapter receives adapter push events (Telegram/Discord/Slack/Matrix). Auth: per-adapter HMAC secret verified server-side on every request; missing/invalid signature -> 401, payload never processed (default-deny). Adapter-scoped secrets are not usable across adapters. AC: valid signature accepted and routed to the owning adapter; invalid/missing signature rejected with 401 and no processing; secret rotation per adapter; docs/spec/integrations-architecture.md §3 updated. Epic: epic-integrations-core.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
