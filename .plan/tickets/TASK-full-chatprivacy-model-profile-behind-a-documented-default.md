<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: full ChatPrivacy model profile behind a documented default

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-privacy.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Message visibility already supports hidden_by_moderator and related states, but the broader ChatPrivacy model (per-participant visibility, field-level disclosure, expiration) has no design decision. Track the scope decision and return later if it is post-1.0.0.

**Evidence (dev 2026-11-18):** report .tmp/intercom/plan-wave/03-nsfw.md; Required-187 in .tmp/intercom/RELEASE-1.0.0.md is open to interpretation; shipped behavior is a single visibility enum with no per-recipient model.

**Scope:** write a short model proposal covering actors, fields, defaults and migration path; decide in-tag vs post-1.0.0 with the operator; if in-tag, implement the smallest field-level privacy rule set with tests; otherwise leave the ticket open with the decision recorded.

**Acceptance Criteria:**

- [ ] written privacy model with explicit default
- [ ] operator in-tag or post-1.0.0 decision recorded
- [ ] no silent behavior change to existing visibility semantics

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
