# BUG: frontend dead CSRF bearer header machinery

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/frontend/fe-fetch.ts, src/frontend/alpine/htmx.ts (htmx:configRequest), src/frontend/alpine/transports/server.ts; server auth (src/auth/shared.ts, src/middleware/auth/authenticate.ts).

Symptom: The frontend reads localStorage.session_token and sends Authorization: Bearer <localStorage.session_token> and X-CSRF-Token on every request. But (a) the server issues the JWT as an HttpOnly, SameSite=Lax cookie ll_token and NEVER writes localStorage.session_token (no setItem exists) — so the Bearer path is dead and auth actually works via the cookie; (b) the server has ZERO CSRF validation (grep over src finds none) — X-CSRF-Token is sent but never checked. Confirmed by direct source read. Current impact: the cookie (HttpOnly/SameSite=Lax) carries auth, so there is no live break and the token is NOT in localStorage (not XSS-stealable). Risk: the localStorage-bearer design is misleading dead code and a latent XSS-theft vector if any path ever populates localStorage with the JWT; the CSRF header-sending is theater offering no defense-in-depth (today mitigated only by SameSite=Lax).

Fix: either (1) implement real double-submit CSRF (server validates X-CSRF-Token against csrf_token cookie/session) and reconcile the auth header story (decide cookie-only vs bearer, don't mix), or (2) remove the dead localStorage-bearer + X-CSRF-Token sending to avoid a false sense of security. Document the chosen trust boundary.

Acceptance: auth header story is coherent and documented; CSRF is either server-validated or the dead machinery removed; no unvalidated security header is sent.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
