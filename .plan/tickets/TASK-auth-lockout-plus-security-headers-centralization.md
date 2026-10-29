<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: auth lockout plus security headers centralization

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epics: auth/security (after P0 F1/F3/F4 federation fixes). Slices: src/auth/lockout.ts brute-force lockout (new file), src/security/headers.ts centralization (new file), Semgrep/gitleaks gates, audit-log wiring. Defer MFA rollout, Vault, ZAP. Caveats: lockout denial-of-service on legit users, header breakage on embedded clients.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
