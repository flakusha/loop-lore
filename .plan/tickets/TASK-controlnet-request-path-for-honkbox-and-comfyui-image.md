<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ControlNet request path for honkbox and ComfyUI image

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: comfyui-honkbox image path gains controlnet slug plus base64 control PNG plus strength in (0,1]; half-spec rejected client-side. AC: 501 stubs fall back to unconditioned graph. No server dep; ControlNet triple already shipped honkbox-side.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
