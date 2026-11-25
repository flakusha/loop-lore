<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: opencode adapter

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the opencode adapter shipped as a thin generic subclass — `createOpenCodeAdapter` (`src/integrations/harness/opencode.ts:41`), registered at `src/integrations/harness/flavor-factories.ts:31`. The filed premise (no opencode adapter) was stale.
**Priority:** high
**Effort:** Large
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Implement opencode ACP adapter spawning official opencode binary over stdio JSON-RPC; handle initialize/session/new/session/prompt/session/cancel/session/request_permission/fs/read_text_file. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
