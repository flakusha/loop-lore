<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Isolate auth cookies per local instance so two dev servers do not clobber each other

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Give each local instance its own auth cookie scope so two dev servers do not clobber each other's sessions.

**Context:**

`src/routes/auth/shared.ts:73-74` declares `TOKEN_COOKIE = "ll_token"` and `COOKIE_PATH = "/"`; the cookie is emitted at `:96-102` with `Path`, `Max-Age`, `HttpOnly`, and `SameSite=Lax`, and **no `Domain`**. Cookies are not port-scoped (RFC 6265 §5.1.4, §5.2.3), so `localhost:3000` and `localhost:3001` share a single cookie jar: logging into instance B overwrites the token instance A is using, and the user is logged out of A mid-session. The symptom — random logouts with no visible cause — reads like a session-expiry bug and sends people looking in the wrong place.

Hostname-based isolation does work, because cookie matching ignores the port. `a.localhost` and `b.localhost` resolve to loopback on Chrome and Firefox, so they get separate jars from the same browser. This ticket's shape depends on decision **D1** in `docs/review/federation-local-multi-instance-review.md` §5.

**Direction:**

1. **(assumption D1: dev-only hostname recipe, no cookie-name config change).** Document in the harness runbook that local multi-instance setup MUST use distinct hostnames, and state explicitly that distinct ports alone are not isolation. Cite RFC 6265 §5.1.4/§5.2.3 in the runbook so the next reader does not re-litigate it.
2. Confirm both hostnames resolve in the dev environment and document the `/etc/hosts` fallback for `curl`, which does not use browser resolver rules.
3. Add a regression test pinning the current cookie attributes — `Path=/`, no `Domain` — so that any future change to cookie scoping is a deliberate, visible diff rather than an accident.
4. Record the D1 trade-off in this ticket: a configurable cookie name would be more robust but touches auth on every read path; the hostname recipe is free but depends on `*.localhost` resolving.

If D1 later resolves toward a cookie-name config key, the shape changes: add the key under `auth`, thread it through `setTokenCookie`, and keep this ticket's test as the guard for the default.

**Acceptance Criteria:**

- [ ] Two instances on `a.localhost` and `b.localhost` hold independent sessions in one browser
- [ ] The runbook states plainly that ports alone do not isolate cookies, with the RFC citation
- [ ] The runbook documents the `/etc/hosts` entry needed for `curl` to reach both hostnames
- [ ] A test asserts the emitted cookie carries `Path=/` and no `Domain` attribute
- [ ] Decision D1 and its trade-off are recorded in the ticket, including what changes if it resolves toward a cookie-name key
- [ ] `bun run check` green

**Dependencies:**

- None within this epic. This ticket's deliverable is a runbook constraint (distinct hostnames, with the RFC citation) plus a regression test pinning the current cookie attributes — neither needs the harness, `DATA_DIR`, or any other epic ticket to exist first. It is evidence-driven from `src/routes/auth/shared.ts` and decision D1 alone, so it can be scheduled at any point.

**Related Tickets:**

- `TASK-add-a-two-instance-local-federation-dev-harness-and-runbook.md` — **bidirectional, ships together.** This ticket supplies the runbook constraint the harness must follow (distinct hostnames, not distinct ports); the harness supplies the place the constraint is written down. Neither blocks the other, which is why the link is recorded here rather than as a dependency in either direction.

**Out of Scope:**

- Production multi-domain deployments (`TASK-sni-multi-certificate-serving-for-multiple-domains.md`)
- The CSRF cookie Secure-flag hardening (`BUG-bug-csrf-cookie-secure-flag-hardcoded-true-breaks-over-plain.md`)
