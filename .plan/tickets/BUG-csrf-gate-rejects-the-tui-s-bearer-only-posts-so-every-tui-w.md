<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: CSRF gate rejects the TUI's Bearer-only POSTs, so every TUI write 403s in multi-user mode

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The server's CSRF gate (src/middleware/csrf.ts decideCsrf) requires the browser double-submit pair (X-CSRF-Token header + csrf_token cookie) for EVERY unsafe method on every non-exempt route, with no exemption for requests that carry an explicit Authorization: Bearer header. The TUI (src/tui/**, and src/utils/safe-fetch/headers.ts buildAuthHeaders) authenticates with Bearer only - it holds no cookie and sends no CSRF token - so every TUI write is rejected 403 csrf_verification_failed whenever CSRF is enabled. CSRF is enabled whenever auth.csrfSecret OR auth.jwtSecret is set (src/elysia-app.ts:166-168), and auth.jwtSecret is REQUIRED when auth.required=true, so this bites every multi-user deployment. Affected: the TUI chat send, image gen, model-admin writes, and the harness approve/deny decisions (src/tui/harness/api.ts decidePermission). Fail-closed, so it is a functional gap, not an authorization hole - but it contradicts the documented trust boundary in packages/core/src/utils/safe-fetch/types.ts ('Non-browser (TUI/server): pass sessionToken ... which inject an Authorization: Bearer header the server also accepts') and the resolution of BUG-frontend-dead-csrf-bearer-header-machinery ('tui/chat/api.ts Bearer stays live').

**Epic:** epic-external-harness-acp

**Context:**

## Why it matters

The TUI's write path is dead in every multi-user deployment. The harness approval flow is the sharpest case: `a`/`d` in the harness overlay POST a decision the server refuses with 403, so an operator cannot answer a parked ACP ask from the TUI at all - the ask stays parked and the harness session waits (the permission queue has no timeout).

This is fail-closed, NOT an authorization hole: the denial is the current gate working as written and no unauthorized action happens. The defect is that the gate's rule and the documented trust boundary disagree, and the TUI was built to the documented boundary.

## Verified evidence

- **The gate** - `decideCsrf` (src/middleware/csrf.ts): for an unsafe method on a non-exempt route it requires BOTH the `X-CSRF-Token` header AND the `csrf_token` cookie, equal, and bound to the session. The file contains no check for an explicit Authorization header, so a Bearer-only request is rejected with `csrf_verification_failed` (403).
- **The client** - `buildAuthHeaders` (packages/core/src/utils/safe-fetch/headers.ts) injects the Authorization header from `auth.sessionToken` and sends an `X-CSRF-Token` only when `auth.csrfToken` is passed. Every TUI call passes a session token alone (src/tui/harness/api.ts, src/tui/chat/api.ts, src/tui/asset-view.ts) - no cookie, no CSRF token.
- **The enablement** - src/elysia-app.ts: `csrfEnabled = csrfSecret.length > 0 || jwtSecret.length > 0`, and `auth.jwtSecret` is documented as required when `auth.required=true` (packages/core/src/config/sections/auth.ts). `auth.required` defaults to false (solo mode, where there is no secret and the TUI works because the server derives the solo admin).
- **Probe** (throwaway script, real `applyCsrfPlugin` wiring): Bearer-only POST -> 403 `csrf_verification_failed` (handler not reached); browser POST with a minted double-submit pair -> 200; Bearer GET -> 200.

## Where the fix belongs

The CSRF rule, not the TUI. A request that carries an explicit Authorization header is not forgeable cross-site - a cross-site attacker cannot set that header - so the double-submit pair protects ambient-cookie requests only. Two acceptable shapes:

- exempt requests that present an Authorization header from CSRF verification, keeping the gate intact for cookie-authenticated browser requests (cheapest, matches the documented client split), or
- teach the TUI to carry a CSRF pair (needs a token endpoint and a cookie jar a terminal client does not have - heavier, and it makes the TUI look like a browser).

Either way the client story must be recorded in the trust-boundary docs (packages/core/src/utils/safe-fetch/types.ts and the CSRF module header) so the header contract stays coherent - the resolution of BUG-frontend-dead-csrf-bearer-header-machinery already claims the TUI's Bearer path 'stays live', which this gap contradicts.

## Do NOT touch

- Do NOT relax the browser path: the double-submit pair stays required for cookie-authenticated unsafe requests.
- Do NOT change the harness route authorization: `requirePermission("admin.system")` stays the only gate on the harness surface.

**Acceptance Criteria:**

- [ ] A TUI-shaped request (Authorization header, no cookie, no CSRF token) on an unsafe method is not rejected by the CSRF gate, with the rule recorded in the trust-boundary docs.
- [ ] A cookie-authenticated browser request WITHOUT the double-submit pair is still rejected 403 (no regression on the browser path).
- [ ] The harness approve/deny POST is proven end-to-end against the real route with a Bearer-only TUI client and CSRF ENABLED.
- [ ] The trust-boundary docs state which clients the CSRF gate covers and why.
