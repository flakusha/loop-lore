<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Split generic-acp.ts protocol adapter (size debt)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

src/integrations/harness/generic-acp.ts is one 874-line adapter class (552 code). Budget bumped 330 to 565 with rationale comment to clear the blocking size-strict gate. Structural split wanted: session lifecycle (list/resume/load/delete), model/mode, permission elicitation (pending/respond/serve), fs-request serving, and usage reporting each deserve their own module. Risk: private methods share transport state; extract carefully with protocol tests. The other four 2026-11-20 pragma bumps (run-pipeline 455, routes 330, image-gen 335, fake-acp 355) are cohesive single-purpose modules, no split needed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
