<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(api): return 400/406 for unknown API versions instead of silent v1 coercion

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-api-versioning

**Summary:**

Sources: stream-c #5. Where: src/routes/middleware/version-resolver.ts:37-53; src/elysia-app.ts:276-277. Gap: /api/v2/... (path or Accept: application/vnd.loop-lore.v2+json) falls through to DEFAULT_VERSION 1, and the catch-all then 308s /api/v2/x to /api/v1/v2/x (404). Future-version clients get a confusing redirect-to-404 instead of a signal naming supported versions. Acceptance: unsupported version signals return a 4xx JSON envelope listing supported versions; no double-prefix redirect (/api/v1/v2/...) is emitted for them. Priority: low - no v2 exists today; future-proofing only.

**Context:**

The version resolver had exactly one fallback: anything it could not map to a supported version became "1". A client asking for `/api/v2/chats` therefore looked like a v1 client to the whole app, and the catch-all route then rewrote the path to `/api/v1/v2/chats` — a 308 to a 404 that named neither the bad version nor the supported ones.

The fix keeps the resolver's fallback for requests that name no version (legacy `/api/*` clients still get the v1 redirect) and rejects requests that name a version this server does not serve. The rejection lives in the version middleware itself — the `versionResolver()` plugin answers it in an `onRequest` hook — so every app that mounts the middleware gets the same behaviour, and the 400 reaches the client instead of the catch-all's redirect-to-404.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- `src/routes/middleware/version-resolver.ts:62-82` — new `unsupportedVersionResponse(request)` returns a 400 JSON error envelope naming the supported versions when the client names an unsupported version (path `/api/vN/...` or `Accept: application/vnd.loop-lore.vN+json`), and `undefined` otherwise.
- `src/routes/middleware/version-resolver.ts:113-119` — the `versionResolver()` plugin rejects such a request in an `onRequest` hook, so the 400 is answered before the request reaches a route (or the catch-all 308 to `/api/v1/v2/x`). Every app that mounts the middleware gets the same gate, so `src/elysia-app.ts` needed no change — the plugin is already mounted there.
- `src/routes/middleware/version-resolver.ts:97` — `resolveVersion` keeps its documented fallback for requests that name no version.
- `docs/spec/api-versioning.md` — documents the 400 for an unsupported version.
- Regression tests: `src/routes/middleware/version-resolver.test.ts` → "createApp rejects unknown API versions > returns 400 for an unknown path version instead of redirecting to a 404" and "returns 400 for an unknown Accept-header version"; "leaves the legacy unversioned redirect intact" pins that an unversioned `/api/chats` still 308s to `/api/v1/chats`.
