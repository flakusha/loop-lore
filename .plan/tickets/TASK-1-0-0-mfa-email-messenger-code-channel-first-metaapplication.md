<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 MFA: email/messenger code channel first (metaapplication-ready)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-two-factor-auth
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Operator direction: email/messenger-bot code delivery is the FIRST MFA implementation for 1.0.0, NOT TOTP-first.

Why: email and messenger-bot delivery will be required later for the metaapplication, so the delivery-channel work built here (code issue, verify, expire, rate limiting, bot-token and email config surface) is shared with that later requirement instead of being rebuilt.

Scope:

- Code issue / verify / expire flow behind permission gating.
- Rate-limited sends.
- Bot-token and email config surface.

Explicitly deferred: TOTP / authenticator-app support is deferred to a follow-up ticket.

Related epics, Status lines quoted verbatim from each epic header:

```text
.plan/epics/epic-two-factor-auth.md
**Status:** Not Started
**Status Note:** Not Started. 2026-11-09 T10 verify: still no implementation (no TOTP/WebAuthn/backup-code symbols in src/); TASK-two-factor-multi-factor-auth.md explicitly carried, not built in T10 lane.

.plan/epics/epic-auth-channel-provisioning.md
**Status:** Not Started
**Status Note:** this bundle
```

Related: .plan/epics/epic-two-factor-auth.md, .plan/epics/epic-auth-channel-provisioning.md, .tmp/intercom/RELEASE-1.0.0.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
