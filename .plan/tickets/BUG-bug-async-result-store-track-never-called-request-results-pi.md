# BUG: BUG: async result store track() never called; request_results pipeline is a no-op

**Status:** ✅ Resolved (already on dev, 2026-09-04)
**Priority:** high
**Effort:** Medium

## Summary

src/async/store.ts exposes track() (upsert into request_results) but no production caller supplies an asyncStore to maybeAutoReply (src/routes/messages/reply.ts guards on asyncStore !== undefined, and src/routes/messages/create.ts calls maybeAutoReply WITHOUT asyncStore). src/middleware/lifecycle.ts only calls complete/fail (UPDATEs), never track. Result: request_results rows are never created, so GET /api/requests/:id/status always 404s and idempotency table-backend replay is dead. Fix: wire an asyncStore into the messages-create route / elysia-app lifecycle so track() runs on request start, or remove the dead feature.

## Resolution

Already fixed in dev by `c91edd02` (fix(app): registerPlugins plumbs asyncStore into HandlerOpts). Verified 2026-09-04 against current `dev` (`7c76aed4`):

- `src/app/register-plugins.ts` — destructures `asyncStore` from opts and includes it in `handleOpts`.
- `src/routes/messages/types.ts` — `HandlerOpts` declares optional `asyncStore?: AsyncStore`.
- `src/routes/messages/create.ts:176` — forwards `opts.asyncStore` to `maybeAutoReply`, which then calls `asyncStore.track(...)` when `x-request-id` is present (`src/routes/messages/reply.ts`).

`request_results` rows are now created on the create-message path; `GET /api/requests/:id/status` and idempotency table-backend replay are live.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
