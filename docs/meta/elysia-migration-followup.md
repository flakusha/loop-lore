# Elysia Migration — Follow-up Tasks

All 23 API route modules migrated to Elysia plugins (Phase 1 & 2 complete).
Catch-all in `elysia-app.ts` delegates remaining API/static/view requests.
Remaining items below for follow-up PRs.

---

## 1. Route Module Migrations — Status

All 21 API route files migrated to Elysia plugins. State per file:

| File | Status | Notes |
| ---- | ------ | ----- |
| `src/routes/activity.ts` | Done | `activityRoutes` plugin |
| `src/routes/activity-stream.ts` | **Remains** | SSE — still uses old `registerRoute()` |
| `src/routes/frontend-logs.ts` | Done | `frontendLogsRoutes` plugin |
| `src/routes/api-keys.ts` | Done | `apiKeysRoutes` plugin |
| `src/routes/auth.ts` | **Partial** | Has both Elysia plugins AND `dispatchAuth` compat shim |
| `src/routes/message-encryption.ts` | Done | `messageEncryptionRoutes` plugin |
| `src/routes/chats.ts` | Done | `chatsRoutes` plugin |
| `src/routes/messages.ts` | Done | `messagesRoutes` plugin |
| `src/routes/characters.ts` | Done | `charactersRoutes` plugin |
| `src/routes/users.ts` | Done | `usersRoutes` plugin |
| `src/routes/worlds.ts` | Done | `worldsRoutes` plugin |
| `src/routes/admin.ts` | Done | `adminRoutes` plugin |
| `src/routes/views.ts` | **Remains** | 558 lines, still uses old `registerRoute()` + `dispatch` |
| `src/routes/actor-memories.ts` | Done | `createEntityRoutes` → `actorMemoriesRoutes` |
| `src/routes/actor-lore-entries.ts` | Done | `createEntityRoutes` → `actorLoreEntriesRoutes` |
| `src/routes/actor-items.ts` | Done | `createEntityRoutes` → `actorItemsRoutes` |
| `src/routes/actor-notes.ts` | Done | `createEntityRoutes` → `actorNotesRoutes` |
| `src/routes/world-lore-entries.ts` | Done | `worldLoreEntriesRoutes` plugin |
| `src/routes/story-items.ts` | Done | `storyItemsRoutes` plugin |
| `src/routes/story-states.ts` | Done | `storyStatesRoutes` plugin |
| `src/routes/story-turns.ts` | Done | `storyTurnsRoutes` plugin |
| `src/routes/quests.ts` | Done | `questsRoutes` plugin |
| `src/routes/settings.ts` | Done | `settingsRoutes` plugin |
| `src/routes/health.ts` | Done | `healthRoutes` plugin |
| `src/personas/controller.ts` | **Not migrated** | Still uses old dispatch + `BAD_METHOD` |
| `src/assets/controller.ts` | **Not migrated** | Still uses old dispatch + `RequestContext` |
| `src/age-gate/controller.ts` | **Not migrated** | Inline dispatch |
| `src/generation/controller.ts` | **Not migrated** | Inline dispatch |

### Key remaining files

| File | Priority | Reason |
| ---- | -------- | ------ |
| `views.ts` | **High** | 558 lines, ~20 routes, still imports from old `router.ts`. Blocking router.ts deletion. |
| `activity-stream.ts` | **Medium** | SSE endpoint, 1 route, small. Quick win. |
| `auth.ts` | **Low** | Already has Elysia plugins. Only `dispatchAuth` compat shim remains. |
| `personas/controller.ts` | **Low** | Blocks `BAD_METHOD`/`extractIdFromPath` cleanup in http-utils.ts |
| `assets/controller.ts` | **Low** | File upload complexity |
| `age-gate/controller.ts` | **Low** | Small, standalone |
| `generation/controller.ts` | **Low** | 9 routes, complex |

---

## 2. Infrastructure Cleanup

### Delete `src/routes/router.ts`

- Remove `apiDispatch()`, `registerRoute()`, `ROUTE_MODULES` array
- Remove `RouteDispatch`, `RouteDispatchParams` type exports
- No longer needed — Elysia handles dispatch

### Remove side-effect imports from `server.ts`

- Each `import "./routes/activity"` line registers via `registerRoute()` — not needed once all modules are Elysia plugins
- Replace with `app.use(activityRoutes)` in the app builder

### Remove `BAD_METHOD()` from `http-utils.ts`

- Elysia returns 404 for unmatched methods automatically
- Remove the `BAD_METHOD` helper export

### Remove `extractIdFromPath()` from `http-utils.ts`

- Elysia path params (`:id`) replace manual regex extraction

### Remove `extractMessagesChatId()` from `messages.ts`

- Same — Elysia path params

---

## 3. Auth Middleware Refit

### `src/middleware/auth.ts`

- Convert `authenticate()` function to an Elysia `.guard()` or `.onBeforeHandle` plugin
- Token extraction (Bearer header > cookie) stays the same
- Map `RequestContext` to Elysia's `store` for handler access
- Solo mode fallback stays the same logic

### `src/middleware/response-headers.ts`

- Currently wired via `headerPolicy.apply()` at the top of the fetch handler
- Convert to Elysia `.onAfterHandle()` hook
- No logic change — just the attachment point

### `src/middleware/dynamic-response.ts`

- Same pattern: convert to Elysia `.onAfterHandle()` hook
- Runs before the response-header policy (order preserved)

---

## 4. `views.ts` Deep Refactor

### Problem

`views.ts` has ~450 lines, ~20 regex-based route blocks, and complex dispatch logic.

### Strategy

1. Keep the existing function-based routing inside a single Elysia handler initially
2. Break the `dispatchView` function into smaller Elysia route handlers
3. Each view pattern becomes its own `.get()` call

### Route mapping

```
GET / → (still handled by server.ts static file)
GET /partials/:name → .get("/partials/:name", handleStaticPartial)
GET /dynamic/characters/grid → .get("/dynamic/characters/grid", serveCharactersGrid)
GET /dynamic/gallery/grid → .get("/dynamic/gallery/grid", serveGalleryGrid)
GET /dynamic/worlds/list → .get("/dynamic/worlds/list", serveWorldsListDb)
GET /dynamic/worlds/:id/detail → .get("/dynamic/worlds/:id/detail", serveWorldDetailContent)
GET /dynamic/characters/:id/edit-form → .get("/dynamic/characters/:id/edit-form", serveCharacterEditForm)
GET /dynamic/characters/:id/chat-list → .get("/dynamic/characters/:id/chat-list", serveCharacterChatListDb)
GET /character/:slug → .get("/character/:slug", serveCharacterChatList)
GET /character/:slug/edit → .get("/character/:slug/edit", serveCharacterEdit)
GET /character/:slug/:chatId → .get("/character/:slug/:chatId", serveCharacterChat)
GET /characters/:id/edit → .get("/characters/:id/edit", serveCharacterEdit)
GET /worlds → .get("/worlds", serveWorldsList)
GET /worlds/:id → .get("/worlds/:id", serveWorldDetail)
GET /worlds/:id/edit → .get("/worlds/:id/edit", serveWorldEdit)
GET /views/:name → .get("/views/:name", serveView)
```

---

## 5. `entity-routes.ts` Integration

### Problem

`createEntityRoutes()` returns a `{ dispatch }` object that registers via `registerRoute()`. The dispatch function uses the old `RouteDispatchParams` interface.

### Strategy

- Keep `createEntityRoutes()` for the config-driven CRUD pattern
- Add an overload that accepts DB/context injection
- Each entity-routes file wraps its factory in an Elysia plugin

---

## 6. Testing

### Add Elysia-aware testing

- Elysia provides `app.handle(new Request(...))` for integration tests
- Migrate existing e2e tests to use this pattern
- Add per-module route tests

### Verify SSE endpoints

- `GET /api/activity/stream` and `GET /api/generation/stream/:chatId` both use raw `ReadableStream`
- Must verify they still work after migration (no framework interference)
- `response-headers` already has SSE guards — verify they still fire

---

## 7. Performance

### Verify no regression

- Elysia is faster than raw `Bun.serve()` in benchmarks, but the middleware layer adds overhead
- Run a basic latency benchmark before/after migration
- Monitor memory usage in development

### AOT compilation

- Elysia supports `aot: true` for Ahead-of-Time route compilation
- Enable once all modules are migrated for ~10-20% route throughput improvement

---

## Migration Order (Recommended)

```
Phase 1 (done)  → foundation + health + settings
Phase 2 (done)  → activity, frontend-logs, api-keys, message-encryption
Phase 3 (done)  → auth (partial — compat shim remains), chats, messages, characters, users, worlds
Phase 4 (done)  → entity-routes (actors, memories, lore, items, notes, story, quests) + admin
Phase 5         → views.ts deep refactor (Elysia plugin)
Phase 6         → activity-stream.ts (SSE), personas, assets, age-gate, generation
Phase 7         → cleanup (router.ts, old middleware, BAD_METHOD, side-effect imports)
```
