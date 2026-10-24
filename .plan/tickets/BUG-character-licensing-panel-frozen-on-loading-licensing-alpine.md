<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Character licensing panel frozen on 'Loading licensing…' — Alpine effects dead after htmx load

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: On /characters/:id/edit the licensing panel stays frozen on 'Loading licensing…' even though its Alpine state loaded correctly (license set, licenseLoading=false) — no panel section (licensing-summary/form/empty) ever renders. Wardrobe and growth editor on the same page update fine.

ROOT CAUSE (suspected): actorLicensingFactory mutates state outside Alpine's reactive proxy — it calls state.setActorId(actorId) on the raw object, and the async loadLicensing() keeps that raw this, so license/licenseLoading writes never trigger x-show effects.

EVIDENCE: Writing via Alpine.$data(el) (license = {...}, licenseLoading = false) and waiting 500 ms still leaves every section at display:none — effects are dead, not just stale:
{"licText":"Licensing ... Loading licensing…","licCount":1,"licStates":[{"before":"none","after":"none","loading":false,"hasLicense":true}]}

FIX DIRECTION: Route the factory/loadLicensing mutations through Alpine's reactive proxy (e.g. use Alpine reactive/datascope for this) so x-show effects re-evaluate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
