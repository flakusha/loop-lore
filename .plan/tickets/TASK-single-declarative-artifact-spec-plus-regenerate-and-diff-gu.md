<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: single declarative artifact spec plus regenerate-and-diff guard

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Proposal .tmp/research/lolo-harness-doc-schema-proposal-2026-11-26.md section 3: replace the shell prose doc with one declarative artifact spec (per-record-type header validation, no YAML migration) plus a regenerate-and-diff guard that fails when generated plan artifacts drift from sources. Covers Backlog.md field set, ADR tooling, and the task-aware navigation decisions in the proposal. Acceptance: spec file exists; stale generated artifacts fail a gate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
