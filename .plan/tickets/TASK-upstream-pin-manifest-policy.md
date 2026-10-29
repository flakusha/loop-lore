<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: upstream-pin-manifest-policy

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-llama-swap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ref-class pin policy (hash > tag > branch > latest/HEAD~N), fetch-time resolution + recorded hashes, quarterly audit cadence; llama-swap stays config-only (no fork) per epic scope. Owner epic: epic-llama-swap. Anchors: epic-llama-swap.md (config-only, loop-lore never rewrites user file); 3-tier dep contract requirements-exacts/pyproject-floors/uv.lock + --inexact sync. Refs: https://git-scm.com/docs/git-patch-id; https://astral.sh/uv (lockfile/floor pattern). Acceptance: policy documented; hash recording; audit cadence. DEFER: bevy crate-pin / godot GDExtension adapters (no in-repo consumer). Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
