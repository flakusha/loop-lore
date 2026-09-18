<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: frontend dead CSRF bearer header machinery

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** [OK] Done - full closure (dead Bearer removed, cookie-only browser story, 2026-09-16)
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/frontend/fe-fetch.ts, src/frontend/alpine/htmx.ts (htmx:configRequest), src/frontend/alpine/transports/server.ts; server auth (src/auth/shared.ts, src/middleware/auth/authenticate.ts).

Symptom: The frontend reads localStorage.session_token and sends Authorization: Bearer <localStorage.session_token> and X-CSRF-Token on every request. But (a) the server issues the JWT as an HttpOnly, SameSite=Lax cookie ll_token and NEVER writes localStorage.session_token (no setItem exists) — so the Bearer path is dead and auth actually works via the cookie; (b) the server has ZERO CSRF validation (grep over src finds none) — X-CSRF-Token is sent but never checked. Confirmed by direct source read. Current impact: the cookie (HttpOnly/SameSite=Lax) carries auth, so there is no live break and the token is NOT in localStorage (not XSS-stealable). Risk: the localStorage-bearer design is misleading dead code and a latent XSS-theft vector if any path ever populates localStorage with the JWT; the CSRF header-sending is theater offering no defense-in-depth (today mitigated only by SameSite=Lax).

Fix: either (1) implement real double-submit CSRF (server validates X-CSRF-Token against csrf_token cookie/session) and reconcile the auth header story (decide cookie-only vs bearer, don't mix), or (2) remove the dead localStorage-bearer + X-CSRF-Token sending to avoid a false sense of security. Document the chosen trust boundary.

Acceptance: auth header story is coherent and documented; CSRF is either server-validated or the dead machinery removed; no unvalidated security header is sent.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Original premise was half-stale: server double-submit CSRF already existed
and wired (`csrf-plugin.ts` + `applyCsrfPlugin`, `elysia-app.ts:134`;
`csrf.ts` mint/verify; `csrf{,.plugin.coverage,.integration}.test.ts` green).
What remained was the dead browser Bearer fallback: three
`localStorage.session_token` reads with no writer anywhere in `src/`.
Removed all three (browser is now cookie-only: HttpOnly `ll_token` +
validated `X-CSRF-Token` double-submit); `FetchAuth.sessionToken` kept and
re-scoped to TUI/server callers (`tui/chat/api.ts` Bearer stays live —
server accepts Bearer-then-cookie per `authenticate.ts:41-52`). Bonus fix:
`ServerTransport.flush()` now sends the CSRF header instead of the dead
Bearer (its POST to `/api/frontend/logs` would otherwise 403 under the
gate). Trust boundary documented in `fe-fetch.ts`, `htmx.ts`,
`server.ts`, `safe-fetch/types.ts` + `headers.ts`.
Verify: safe-fetch 38 pass, tui/chat 25 pass, CSRF 83 pass,
frontend-logs 6 pass, `check --gates "typecheck - frontend,
typecheck - scripts"` green, `session_token` in `src/frontend` -> comments
only, zero live reads.
