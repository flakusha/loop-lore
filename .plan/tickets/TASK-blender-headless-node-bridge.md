<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Blender headless node bridge

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, blender
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Blender background-mode python invocation as a B-tool: conversion/repair/bake/retopo recipes invoked by the 3D post-process chain; capability probe plus version report; subprocess isolation (GPL output-ownership documented). AC: recipe invocations are timeout-bounded, exit-code-checked, and provenance-stamped; concurrent runs serialize per Blender instance.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
