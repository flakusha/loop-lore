<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: BUG: CSRF cookie Secure flag hardcoded true; breaks over plain HTTP

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Fixed (ccac5b9d server + fix-review-quickwins clients)
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/csrf.ts cookieForDecision uses resolveCookieSecure(opts.cookieSecureOverride, opts.cookieSecureInProd ?? true) so Secure is always true unless cookieSecureOverride is explicitly false. There is no NODE_ENV / LL_COOKIE_SECURE wiring. Over plain HTTP (dev / HTTP deployments) a Secure cookie is never stored by the browser, so the csrf_token cookie is never set and every unsafe request fails CSRF verification (403). Fix: drive Secure from NODE_ENV === production unless overridden, mirroring src/routes/auth/shared.ts setTokenCookie.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing

## Resolution

- **Branch:** `fix-csrf-ll-cookie-secure-wiring`
- **Commits:**
  - `c6a32eedb` (became `3cf92a48f` after rebase) `fix(csrf): wire LL_COOKIE_SECURE into csrf_token cookie Secure flag`
  - `81bb05723` (became `a707bc330` after rebase) `chore(size): bump csrf.ts and elysia-app.ts size-allow for new helper`
- **What landed:** added `readCookieSecureOverrideFromEnv` (`src/middleware/csrf.ts:103`) that maps `LL_COOKIE_SECURE` (`"true"` → `true`, `"false"` → `false`, anything else → `undefined`). Wired into `csrfOpts.cookieSecureOverride` in `src/elysia-app.ts:122`. Removed dead `src/middleware/csrf-wiring.ts`.
- **Coverage:**
  - Unit (5): `readCookieSecureOverrideFromEnv` — `"true"`, `"false"`, unset, `"1"/"yes"/""`, case-sensitive `TRUE`/`True`
  - Unit (5): `cookieForDecision` — override=true, override=false, cookieSecureInProd default, NODE_ENV derivation, no-override behavior
  - Integration (4): NODE_ENV=production, NODE_ENV unset, `LL_COOKIE_SECURE=true`, `LL_COOKIE_SECURE=false` (regression guard)
  - 325/325 middleware tests pass; `bun run check` 24/24 gates pass
- **Aligned with:** `src/routes/auth/shared.ts::setTokenCookie` (case-sensitive, same decision matrix, same override names)
- **Out of scope:** documentation AC checkbox remains open — no `.md` files mention `LL_COOKIE_SECURE` yet, deferring to a docs sweep ticket.
