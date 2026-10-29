<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: UI API workflow converter

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, converter, workflows
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Generic, library-level UI-format to API-format ComfyUI workflow converter: subgraph flattening, promoted-widget substitution by index, link rewrite, and hidden JSON widget preservation. Driven by the v-0010 Director workflow as fixture; cross-linked from the IVSS epic. AC: v-0010 converts to a submittable API graph (fixture committed) and a subgraph-free reference workflow converts identically to its own API form.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
