<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: e2e version-redirect.test.ts fetches /api/v1/* paths but expects 308 redirect

**Status:** ✅ Done (fix-version-redirect-e2e — corrected the two `/api/v1/...` URLs to `/api/...` and dropped the duplicate obsolete "(legacy route still registered)" test)

**Priority:** medium

**Effort:** Small

**Tags:** e2e, tests, api-versioning, coverage-gate

**Summary:**

`tests/e2e/flows/version-redirect.test.ts` had two failing tests that fetched `/api/v1/no-such-endpoint-xyz` and expected `308 Location: /api/v1/no-such-endpoint-xyz`. The `/api/v1/*` prefix is explicitly excluded from `versionRedirect()` in `src/elysia-app.ts` (line 254) — it's a carve-out to prevent the double-prefix loop. Unknown `/api/v1/*` paths therefore fall through to the v1 barrel and return 404, not 308. The two tests described the opposite behaviour ("unversioned /api/{resource} → 308") but the request URL carried the v1 prefix, contradicting the description.

**Context:**

The tests were added 2026-09-21 by `e15359ae feat(frontend): complete v1 endpoint migration`, expecting the legacy v0 catch-all `/api/{resource} → /api/v1/{resource}` redirect chain. After `0c24aabe5 refactor(routes): drop dead non-v1 /api/* route registrations` (2026-09-25), the v0 catch-all that previously redirected unknown paths now still redirects unversioned `/api/*` to `/api/v1/*`, but unknown `/api/v1/*` paths correctly 404 instead of self-redirecting. The test URLs and descriptions got out of sync.

The failing gate was `bun run check`'s `coverage - per-module line %` gate, which short-circuits on `bun test` exit non-zero. 2 of 5 tests in `version-redirect.test.ts` failed with `Expected: 308 / Received: 404`.

**Acceptance Criteria:**

* [x] Both previously-failing tests now pass.
* [x] URLs match the test description (unversioned `/api/...` for the redirect cases).
* [x] No other tests regress.
* [x] `bun test tests/e2e/flows/version-redirect.test.ts` → 4 pass / 0 fail.
* [x] Full `bun run check` `coverage - per-module line %` gate green.

**What was fixed:**

* `tests/e2e/flows/version-redirect.test.ts:35` — `unversioned unknown /api/{resource}` fetch URL `/api/v1/no-such-endpoint-xyz` → `/api/no-such-endpoint-xyz`.
* `tests/e2e/flows/version-redirect.test.ts:54` — `unversioned /api/{resource} redirect terminates at the v1 path` first-hop URL: same correction.
* `tests/e2e/flows/version-redirect.test.ts:24-27` — dropped the duplicate obsolete test `GET /api/v1/chats is served (legacy route still registered)`. The comment was factually wrong post-`0c24aabe5` (legacy routes were dropped); the second test `GET /api/v1/chats is served by the v1 barrel` already covers the same behaviour and matches the current state.
* Updated the misleading file-header and inline comments (no functional change): the `/api/v1/{resource}` carve-out is described as "returns the routed response directly (no redirect — would otherwise loop `/api/v1/x → /api/v1/v1/x`)"; the second-hop comment no longer says "(previously: `/api/v1/... → 404 loop`)".

**Verified:**

* `E2E_SAFEGUARD=1 bun test tests/e2e/flows/version-redirect.test.ts` → 4 pass / 0 fail.
* No other test files touched.

**Where:** `tests/e2e/flows/version-redirect.test.ts`


git issue: 1ab0a82
