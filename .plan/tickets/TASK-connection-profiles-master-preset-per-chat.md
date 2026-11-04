<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Connection-profiles master preset per chat

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST connection profiles: one named bundle (API+model+preset+persona) per chat. Scope: named preset bundle entity + per-chat assignment; switching chat switches the full stack. Dedup vs persona presets + generation presets epics. Research: metaapps gap 2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
