<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: check validate and verify composer commands with undefined semantics

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-frontend-chat-commands.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The 1.0.0 gap review found no user-facing check, validate or verify commands. Semantics are still undefined (self-check, linter, consistency gate) so this ticket tracks the decision and implementation.

**Evidence (dev 2026-11-18):** report .tmp/intercom/plan-wave/04-frontend-commands.md; improve and rewrite already shipped, but check/validate/verify have no command registration or UI affordance.

**Scope:** decide whether these are three aliases over one linter or distinct commands; specify input (selection, last message, whole chat), output and permission gates; implement the agreed minimal command(s) through the existing assistant command registry and composer menu; document them.

**Acceptance Criteria:**

- [ ] semantics decision recorded in the ticket
- [ ] command registered and discoverable in the composer
- [ ] one regression test per distinct behavior
- [ ] documentation updated

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
