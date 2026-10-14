<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE harmonization gate is blocking, contradicting its own advisory acceptance criterion

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fe-be-harmonization

**Summary:**

Reconciliation of `.plan/epics/epic-fe-be-harmonization.md` found two of its own acceptance criteria unmet, so the epic could not be closed.

AC2 requires the gate to be advisory, following the innerHTML-XSS precedent. Reality: `scripts/check/parallel/gates.mjs:65` registers it as a plain blocking entry:

    "fe-be - harmony": "bun run scripts/check-fe-be-harmonization.ts"

There is no `|| true` and no `(advisory)` label, so a harmony finding fails `bun run check` outright. The epic text and the registered behaviour disagree.

Decide which is authoritative. If the gate is meant to block, the epic's AC2 is wrong and the epic should say so. If it is meant to be advisory, register it in `ADVISORY_GATES` in `scripts/check/parallel/gates.mjs` and update the epic to match.

Scope: reconcile the two, do not change what the script detects.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
