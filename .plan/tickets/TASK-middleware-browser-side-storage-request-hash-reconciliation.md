# TASK: Browser-side storage of request hash + reconciliation reload

**Status:** ⬜ Open
**Priority:** medium
**Effort:** medium
**Epic:** epic-content-hashing-distributed-integrity
**Issue:** TBD
**Related:**
- `TASK-middleware-fe-be-db-record-content-hashing.md` (provides `X-Record-Hash`)
- `src/frontend/fe-fetch.ts` (frontend fetch wrapper)
- `src/frontend/alpine/use-request-status.ts` (already polls status endpoint)
- `src/middleware/request-id.ts` (worktree)
- `src/middleware/idempotency.ts` (worktree — replay path)

## Summary

Give the browser a **non-mandatory** cache of (request id → last-known
`record_hash` + response body) so that:

1. **Reload-after-completion**: a page reload while a long request is in
   flight may resume by checking the status endpoint and replaying the
   captured response if the row is `complete` AND the local hash matches.
2. **Drift detection**: if the local hash differs from the server's
   `X-Record-Hash`, the browser reloads content from the server (the row
   was mutated externally).
3. **Cold-start**: if nothing is stored for the id, the browser fetches
   from the server with the same id; the idempotency layer replays the
   cached response verbatim.

The cache lives in `localStorage` (survives reload, per-origin, ~5MB
quota). It is NOT used for the request hot path — only for the post-load
reconciliation path.

## Storage shape

Per request id, store:

```
ll-req::<id> ::= JSON({
  hash: "<record_hash>",            // last-known server X-Record-Hash
  method: "POST",
  route: "/api/...",
  status: <number>,
  body: <string>,                   // raw response body
  headers: { ... },                 // subset of response_headers
  storedAt: <iso-8601>,
  ttlMs: 86_400_000                 // 24h default; per-route overridable
})
```

> The `X-Record-Hash` header's presence depends on
> `TASK-middleware-fe-be-db-record-content-hashing.md` **Architectural
> question Q1**. This ticket assumes option 1 (always emitted on tracked
> routes) and degrades gracefully if the header is absent on a given
> response (cache miss → server fetch).

Keys are namespaced under `ll-req::` so other storage (preferences,
auth tokens) is unaffected. The cache is best-effort — quota errors
must NOT break the request.

## Acceptance Criteria

### Frontend

- [ ] New `src/frontend/request-cache.ts` exports `read(id): CachedEntry | null`,
  `write(id, entry): void`, `evict(id): void`, `evictExpired(): number`.
  All functions swallow quota / serialization errors (logger at debug).
- [ ] `src/frontend/fe-fetch.ts` integrates the cache on the **response**
  side only: when the response carries `X-Record-Hash`, the wrapper writes
  the entry. When the caller passes `requestCacheKey: <id>` (opt-in),
  the wrapper reads before fetch and short-circuits if the cached hash
  matches and the body is non-stale.
- [ ] Hash mismatch (`server-hash !== cache-hash`) → evict local entry +
  fetch from server. The mismatch is logged at warn so dashboards can
  spot the case.
- [ ] No-storage fallback: if `localStorage` is unavailable (private
  mode quota errors, SSR, iframe sandbox), the wrapper degrades to a
  direct fetch. No request fails because the cache is unavailable.
- [ ] TTL eviction runs on app boot (`src/frontend/alpine/index.ts` startup
  hook) and after every successful write to keep the cache bounded.

### Reconciliation flow

- [ ] New `src/frontend/reconcile.ts` exports `reconcileRequest(id)` that:
  1. Calls `GET /api/requests/:id/status` (the worktree's endpoint).
  2. If `status === "complete"` and `response.body` matches the cache
     hash → no-op.
  3. If `status === "complete"` and `response.body` differs → reload
     the affected Alpine components via the existing
     `src/frontend/alpine/reload.ts` mechanism.
  4. If `status === "expired"` → evict local cache, fetch from server
     with the same request id (idempotency layer replays if the row is
     still in the offloaded spill).
- [ ] Unit tests in `src/frontend/request-cache.test.ts`:
  - write then read returns the same entry,
  - evict removes the entry,
  - evictExpired removes only entries older than TTL,
  - quota error during write does NOT throw,
  - malformed JSON in `localStorage` does NOT throw on read.
- [ ] E2E test in `tests/e2e/`:
  - POST a long request, capture `X-Record-Hash` from response,
  - reload the page (browser preserves `localStorage`),
  - assert the page resumes without re-firing the request,
  - mutate the row directly via SQLite, reload again, assert the page
    detects the hash mismatch and reloads content.

## Tests

- `bun test src/frontend/request-cache.test.ts` — 5 cases above.
- `bun test src/frontend/reconcile.test.ts` — 3 cases (no-op / reload /
  expired).
- `bun run check` green (lint catches the unused-vars in the test stubs).

## Out of Scope

- **Cookies** as a storage backend. `localStorage` is enough; cookies
  add CSRF surface and 4KB-per-key limits that break the body cache.
  Revisit only if a privacy mode disables `localStorage` for many users.
- Service Worker integration (offline replay). Separate ticket.
- Cross-tab broadcast (BroadcastChannel) of cache invalidation. The
  status endpoint already serves as the cross-tab source of truth; no
  need to duplicate.

## Notes

- The cache stores **response body, not request body**. The idempotency
  layer is keyed on (method, route, request id, **record_hash**), so two
  retries with different payloads are separate keys — replaying an old
  response would be wrong, and we don't.
- The cache MUST be cleared on logout (clear `ll-req::` namespace).
  Add the call to the existing logout handler in
  `src/routes/auth/logout.ts`.
- This ticket does NOT introduce a new DB column; everything lives in
  the browser. The server's only addition is `X-Record-Hash` on the
  replay response, which `idempotency.ts` already has the hook for.
