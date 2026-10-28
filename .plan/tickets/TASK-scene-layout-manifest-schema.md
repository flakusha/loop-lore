<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scene layout manifest schema

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-scene-environment-world-generation
**Tags:** scene, schema
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Versioned manifest JSON schema plus validation (TypeBox), storage, and revision safety (schemaVersion on every read). AC: malformed manifests rejected with field-precise errors; old-version manifests still parse (version-gated); manifest references resolve or are reported missing without crash.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
