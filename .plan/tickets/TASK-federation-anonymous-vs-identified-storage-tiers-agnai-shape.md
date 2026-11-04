<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation anonymous-vs-identified storage tiers (Agnai shape)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-instance-federation
**Tags:** federation, multi-user, research-gap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Agnai shared-server shape (research 03/04): anonymous = browser-localStorage, 100-msg window, ephemeral; registered = MongoDB-backed, JWT, user/character/chat/chat-member tables, chat-member rows + canViewChat for sharing; guest-only-without-DB graceful degradation. Smallest shippable multi-user for epic-instance-federation. Exact tables/functions: web/store/data/storage.ts, srv/db/client.ts, userStore, chat-member. Research: .tmp/research/ai-cheat/03-expanded-takes.md section 1, 04-code-internals.md Agnai section.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
