<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS assistant scenario workflow

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, assistant, workflow-engine
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

scenario-video workflow template (world/location -> scenario -> shots -> references -> soundscape -> confirm -> dispatch) plus generation-video/generation-scenario dispatch backend registration per the workflow-engine annex. AC: end-to-end template test against a stubbed backend; the confirm-preview renders the same assembled payload the scenario page Run panel shows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
