<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set edit-grid workflows

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-view-set-generation
**Tags:** views, comfyui
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Operator-supplied ComfyUI workflows for the three grid tiers (Krea2edit per-angle restage, Qwen-Edit 2511 multiangle, ControlNet pose/depth consistency) as workflow-library rows with var parameter maps (subject asset id upload, angle list, seed). AC: a run produces N ordered assets that land as view_set_items with camera facts captured at write; substitution preserves numeric types (fixture-driven); missing-node ingest reports actionable errors.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
