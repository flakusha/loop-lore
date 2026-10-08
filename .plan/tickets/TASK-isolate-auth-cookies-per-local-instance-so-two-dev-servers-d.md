<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Isolate auth cookies per local instance so two dev servers do not clobber each other

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

ll_token is set with Path=/ and no Domain attribute (src/routes/auth/shared.ts:96-102). Cookies are not port-scoped (RFC 6265 5.1.4 / 5.2.3), so localhost:3000 and localhost:3001 share ONE cookie jar and logging into instance B silently destroys the session on instance A - a symptom that looks nothing like its cause. Distinct hostnames (a.localhost / b.localhost) do isolate correctly; distinct ports alone do not. Resolution: ship the hostname-based dev recipe as part of the harness runbook, and either add a configurable cookie name or set Domain from SERVER_PUBLIC_ORIGIN. Assumption pending decision D1 in docs/review/federation-local-multi-instance-review.md: dev-recipe-only if the recipe proves sufficient. Acceptance: two instances on a.localhost and b.localhost hold independent sessions in the same browser; the runbook documents why ports alone are not isolation; a regression test asserts the cookie attributes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
