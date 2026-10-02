<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Integrations inbound webhook ingestion endpoint

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-integrations-core

**Summary:**

Adopted component: ground-up (HTTP surface). Seam: src/routes/v1/integrations-surface.ts (new) mounted from src/routes/v1/index.ts. POST /api/v1/integrations/webhooks/:adapter receives HMAC-verified inbound webhooks from external relays (email relay, Telegram webhook, Discord interactions, custom tools); per-adapter secret verified before parsing; payload normalized to AdapterMessage and pushed through the bridge inbound path (moderation gate applies). AC: valid signature accepted, bad signature rejected (fixture test); unknown adapter 404; rate limit per source; docs/spec/integrations-architecture.md §3 updated. Epic: epic-integrations-core.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
