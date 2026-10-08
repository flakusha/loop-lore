<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Cross-sync shared world/location state (gated future)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-instance-federation

**Summary:**

Future work per epic-instance-federation.md Cross-Sync section: multiple servers share world definitions + live location state via FEAT-swarm-mode-reconciliation CRDT merge (Epic 26 leader path is fallback). Explicitly GATED — do not start before instance-switching backend (sibling ticket) AND FEAT-swarm-mode-reconciliation land; gate on those completions, not on the G15-G16 blanket (G15/G16/G18 closed, G17 does not block swarm). AC on unblock: partition+heal convergence test on shared world/location docs. Status starts blocked with this gate recorded. Epic: epic-instance-federation.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
