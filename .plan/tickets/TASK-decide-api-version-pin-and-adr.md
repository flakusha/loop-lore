<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide API version pin and ADR

**Status:** Done
**Priority:** high
**Effort:** Small

**Summary:**

Set the explicit 1.0.0 API version contract and record the breaking-change policy as an ADR.

**Context:** Versioned route plumbing and deprecation headers exist, but no ADR fixed the 1.0.0 pin. Operator ruling 2026-11-19: freeze `/api/v1` independent of product SemVer, additive-only; where planned features require new APIs, ship truthful 501 route stubs rather than widening an unpinned contract. TASK-openapi-specification owns the mechanism, not the decision.

**Acceptance Criteria:**

- [x] ADR under .plan/adr/ records the version pin and breaking-change policy (`ADR-api-version-v1.md`).
- [x] ADR convention (location, template) documented for future decisions (`.plan/adr/README.md`).
- [x] Release tracker open-question entry resolved (decision log 2026-11-19).

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: ADR is source of truth.
