<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: fork-adapter-contract

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-comfyui-lifecycle
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Single src/adapters/`<upstream>`/ chokepoint rule documented: lazy imports, capability-over-version detection, ~30-line methods, one contract test per method, fork-owned code budget <100KB. Owner epic: epic-comfyui-lifecycle. Anchors: no src/adapters/ in repo (new surface, grep clean); ../comfyui/scripts/update_local.py:1-33 (update-flow header). Refs: https://git-scm.com/docs/git-patch-id (absorbed-vs-lost classification); https://astral.sh/uv (workspace lockfile/floor pattern). Acceptance: rule documented; conventions + contract-test pattern landed. Do NOT re-file ComfyUI provisioning (covered by epic). Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
