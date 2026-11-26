<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness injection trust boundaries

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Close the remaining untrusted-text-to-system paths from the 2026-11-26 audit: actor.system_prompt authored by create_character/import (system.ts), promoted assistant-role memories widened to assistant scope/shared privacy (memory-promotion.ts, provision.ts), raw world text in /adapt aux prompts, and harness-user prompts forwarded by dispatch without checkPromptInjection. Keep inference-authored and harness-user sources distinct; add wrap-tag/scope assertions.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
