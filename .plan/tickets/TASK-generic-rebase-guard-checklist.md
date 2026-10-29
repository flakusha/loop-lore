<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: generic-rebase-guard-checklist

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-comfyui-lifecycle
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Portable rebase-guard runbook: FF-only fetch, backup-ref (not ORIG_HEAD), patch-id missing/lost classification, mirror guard, refusal-on-dirty, rollback playbook. Owner epic: epic-comfyui-lifecycle. Anchors: ../comfyui/scripts/update_local.py:1-33 (header + rollback stanza); git patch-id mechanism already in use with --force escape hatch. Refs: https://git-scm.com/docs/git-patch-id; https://astral.sh/uv (--inexact/--frozen semantics). Acceptance: checklist/runbook landed (script already exists for ComfyUI — this is the portable checklist, not a rewrite). DEFER: quilt/stgit/guilt tooling (stay with local-branch stack). Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
