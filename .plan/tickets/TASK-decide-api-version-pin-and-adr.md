<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide API version pin and ADR

**Status:** Not Started
**Priority:** high
**Effort:** Small

**Summary:**

Set the explicit 1.0.0 API version contract and record the breaking-change policy as an ADR.

**Context:** Versioned route plumbing and deprecation headers exist, but no ADR fixes the 1.0.0 pin or the breaking-change policy. TASK-openapi-specification owns the mechanism, not the decision.

**Acceptance Criteria:**

- [ ] ADR under .plan/adr/ records the version pin and breaking-change policy.
- [ ] ADR convention (location, template) documented for future decisions.
- [ ] Release tracker open-question entry resolved.

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: ADR is source of truth.
