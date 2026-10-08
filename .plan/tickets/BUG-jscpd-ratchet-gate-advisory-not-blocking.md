<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: jscpd-ratchet-gate-advisory-not-blocking

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

AGENTS.md and the gate registry both describe the jscpd ratchet as BLOCKING; it is registered as an advisory gate.

- scripts/check/parallel/gates.mjs:330 describes it as BLOCKING
- AGENTS.md:266 states the jscpd ratchet gate is BLOCKING
- Reality: ADVISORY_GATES.has("jscpd ratchet") === true in scripts/check/parallel/gates.mjs; runner.mjs:160 executes it but a failure does not fail the run (report.mjs:162)

Impact: an operator trusting the documentation will believe clone growth blocks landing, and will not realize the gate reports without enforcing.

Fix direction: reconcile the documentation with the registry — either move the gate out of ADVISORY_GATES or correct both doc sites.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
