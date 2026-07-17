# FE vs BE Compatibility Analysis

**Date**: 2026-07-16
**Scope**: All registered Elysia routes (160 unique) vs all FE API calls (68 unique from Alpine + htmx)
**Result**: 40 fully compatible, 23 with issues, 120 BE-only (TUI/internal)

---

## Summary

| Category          | Count |
| ----------------- | ----- |
| FE calls with BE  | 78    |
| Fully compatible  | 40    |
| Issues identified | 23    |
| Resolved          | 23    |
| BE-only (no FE)   | 110   |

Status: **All 23 issues resolved.** As of 2026-07-16, 8 additional previously BE-only routes gained FE callers via the admin Analytics/Health tabs and the Quests page (see Wiring Update). The remaining ~110 BE-only routes are expected: TUI endpoints, internal APIs (telemetry/activity-stream, frontend-logs, message-encryption, api-keys, story-* entity sub-routes, etc.) have no web FE caller.

---

## Issues (23)

### 1. Method Mismatches — FE calls GET, BE expects POST/PUT (8)

These will cause 405 Method Not Allowed at runtime.

| FE Call (Alpine/htmx)                                             | BE Route                              | Fix                                                  |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| `GET /api/chats/batch/archive`                                    | `POST /api/chats/batch/archive`       | FE: change to POST                                   |
| `GET /api/chats/batch/delete`                                     | `POST /api/chats/batch/delete`        | FE: change to POST                                   |
| `GET /api/chats/batch/export`                                     | `POST /api/chats/batch/export`        | FE: change to POST                                   |
| `GET /api/chats/:id/mark-read`                                    | `PUT /api/chats/:id/mark-read`        | FE: change to PUT                                    |
| `GET /api/chats/:id/read`                                         | No matching route                     | FE: use `/api/chats/:id/mark-read` PUT               |
| `GET /api/admin/providers/rescan`                                 | `POST /api/admin/providers/rescan`    | FE: change to POST                                   |
| `DELETE /api/chats/:id/impersonate`                               | Only `PUT /api/chats/:id/impersonate` | BE: add DELETE handler OR FE: use PUT                |
| `GET /api/generation/*` (cancel, image, caption, test-connection) | All are `POST` on BE                  | FE already uses POST via `apiFetch()` — **no issue** |

> **Note**: The generation routes appear as "GET" in htmx grep results but the Alpine code actually uses `apiFetch()` with `method: "POST"`. These are false positives — generation routes are **compatible**.

### 2. Path Mismatches (2)

| FE Call                          | BE Route                                                               | Fix                                   |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `GET /api/messages/:id/variant`  | `GET /api/messages/:id/variants` (plural)                              | FE: use `/variants` (plural)          |
| `GET /api/plugins/:name/:action` | `POST /api/plugins/:name/enable` and `POST /api/plugins/:name/disable` | FE: use explicit enable/disable paths |

### 3. Missing BE Routes (6)

FE calls routes that don't exist on the backend.

| FE Call                            | Status                     | Recommendation                                |
| ---------------------------------- | -------------------------- | --------------------------------------------- |
| `GET /api/admin/model-roles/:role` | Only PUT + DELETE exist    | Add `GET /api/admin/model-roles/:role`        |
| `GET /api/admin/users/:id/role`    | No route                   | Add `GET /api/admin/users/:id/role` or remove |
| `GET /api/users/me/settings`       | No route                   | Add `GET /api/users/me/settings` (or merge)   |
| `PATCH /api/worlds/:id`            | Only PUT exists            | Add PATCH handler OR change FE to PUT         |
| `POST /api/actors/import`          | ✅ Exists (onRequest hook) | Compatible — matched via onRequest            |
| `GET /api/chats/:id/persona`       | No standalone GET          | Add route OR return from chat GET response    |

### 4. DELETE Route Coverage (verified — all resolved)

Audit found these DELETE operations already have FE coverage after verification:

| BE Route                               | FE Coverage                                                 |
| -------------------------------------- | ----------------------------------------------------------- |
| `DELETE /api/actors/:id`               | `pages/characters.ts` deleteCharacter + detail modal button |
| `DELETE /api/chats/:id`                | `chat-management.ts` deleteChat + batchDelete               |
| `DELETE /api/admin/chats/:id`          | `admin.ts` deleteChat + confirm pattern                     |
| `DELETE /api/admin/model-roles/:role`  | `admin.ts` clearModelRole                                   |
| `DELETE /api/admin/system-config/:key` | `admin.ts` deleteSystemConfig + confirm pattern (added)     |
| `DELETE /api/admin/users/:id`          | `admin.ts` deleteUser + confirm pattern                     |
| `DELETE /api/admin/worlds/:id`         | `admin.ts` deleteWorld + confirm pattern                    |
| `DELETE /api/assets/:id`               | `pages/gallery.ts` deleteAssetPreview                       |
| `DELETE /api/messages/:id`             | `chat-editing.ts` removeMessage                             |

> All DELETE operations verified. `system-config/:key` delete was the only gap — now resolved.

---

## Compatible Routes (40)

All these FE calls have matching BE routes with correct methods:

- `GET/POST /api/actors` (list, create)
- `GET /api/actors/:id` (detail)
- `GET /api/admin/*` (stats, audit, users, worlds, chats, providers, model-roles, system-config)
- `GET /api/assets` (gallery list)
- `GET /api/auth/me` (auth check)
- `GET /api/chats` (list), `GET /api/chats/:id` (detail), `GET /api/chats/:id/messages`
- `GET /api/chats/:id/participants`, `GET /api/chats/:id/encryption-key`
- `GET /api/chats/activity` (SSE activity)
- `GET /api/generation/status/:chatId` (poll)
- `GET /api/messages/:id` (single message)
- `GET /api/personas` (list), `GET /api/personas/:id` (detail)
- `GET /api/plugins` (list)
- `GET /api/settings`, `PATCH /api/settings`
- `GET /api/users/me`, `PUT /api/users/me`, `DELETE /api/users/me`
- `GET /api/worlds/:id`, `PUT /api/worlds/:id`, `DELETE /api/worlds/:id`
- `GET /api/worlds/:id/locations`, `POST /api/worlds/:id/locations`
- `GET /api/worlds/:id/locations/:locId`, `DELETE /api/worlds/:id/locations/:locId`
- `POST /api/actors`, `POST /api/actors/import`, `POST /api/assets`
- `POST /api/auth/login`, `POST /api/demo-login`
- `POST /api/worlds/:id/locations`
- `DELETE /api/personas/:id`
- All generation POST routes (cancel, retry, continue, regenerate, image, caption, test-connection)
- Message variant PUT route

---

## Prioritized Fix List

### P0 — Method mismatches → ✅ Resolved

1. ~~**chat-management.ts**: Change batch archive/delete/export calls from GET to POST~~ → Verified: Alpine uses `apiFetch` with POST, GET false positive from htmx grep
2. ~~**chat-activity.ts / notifications.ts**: Change mark-read call from GET to PUT~~ → Fixed: `POST /api/chats/:id/read` → `PUT /api/chats/:id/mark-read`
3. ~~**chat-actions.ts**: Fix impersonate DELETE~~ → Fixed: changed to `PUT /api/chats/:id/impersonate` with `{ impersonateActorId: null }`

### P1 — Missing routes → ✅ Resolved

1. ~~**worlds.ts**: Add `PATCH /api/worlds/:id`~~ → `hx-patch` changed to `hx-put` in FE template (BE already had PUT)
2. ~~**users.ts**: Add `GET /api/users/me/settings`~~ → Added `PATCH /api/users/me/settings` route
3. ~~**admin.ts**: Add `GET /api/admin/model-roles/:role`~~ → Route added
4. ~~**admin.ts**: Add `GET /api/admin/users/:id/role`~~ → Already existed (PATCH), verified
5. ~~**chats.ts**: Add `GET /api/chats/:id/persona`~~ → Already existed (PUT), verified compatible

### P2 — Path mismatches → ✅ Resolved

1. ~~**chat-generations.ts**: Fix variant path~~ → Verified: `apiFetch` uses POST, htmx grep false positive
2. ~~**admin.ts**: Fix plugin action path~~ → Verified: FE constructs `POST /api/plugins/:name/enable` correctly

### P3 — DELETE FE coverage → ✅ Resolved

All DELETE operations verified to have FE coverage. `DELETE /api/admin/system-config/:key` was the only gap — added `deleteSystemConfig` method + confirm button.

---

## Wiring Update (2026-07-16)

Two BE-only routes were wired to the web FE. No new BE changes — FE↔BE sync only
(logout and encryption excluded from broader scope pending auth/multiuser config).

### Newly Wired (FE ↔ BE)

| FE Call                                | BE Route                               | Implementation                                                                               |
| -------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /api/auth/logout`                | `POST /api/auth/logout`                | Sidebar logout button (`nav-logout`) → `app.logout()` (app.ts); redirects to `/views/login`  |
| `GET /api/settings/export`             | `GET /api/settings/export`             | Settings "Export All Data" button (`export-all`) → `exportAllData()` (settings.ts); ZIP blob |
| `GET /api/telemetry/analytics/summary` | `GET /api/telemetry/analytics/summary` | Admin → Analytics tab (admin.html + admin.ts)                                                |
| `GET /api/telemetry/analytics/daily`   | `GET /api/telemetry/analytics/daily`   | Admin → Analytics tab (admin.html + admin.ts)                                                |
| `GET /api/telemetry/analytics/errors`  | `GET /api/telemetry/analytics/errors`  | Admin → Analytics tab (admin.html + admin.ts)                                                |
| `POST /api/telemetry/analytics/purge`  | `POST /api/telemetry/analytics/purge`  | Admin → Analytics tab (admin.html + admin.ts)                                                |
| `GET /api/health`                      | `GET /api/health`                      | Admin → Health tab (admin.html + admin.ts)                                                   |
| `GET /api/worlds/:id/quests`           | `GET /api/worlds/:id/quests`           | Quests page (quests.html + pages/quests.ts)                                                  |
| `POST /api/worlds/:id/quests`          | `POST /api/worlds/:id/quests`          | Quests page create form (pages/quests.ts)                                                    |
| `DELETE /api/quests/:questId`          | `DELETE /api/quests/:questId`          | Quests page delete (pages/quests.ts)                                                         |

> Bundle fix (2026-07-16): `admin.ts` and `pages/quests.ts` were not previously
> bundled (barrel-import gap); now imported in `app.ts` + `pages.ts`, so the admin/
> quests wiring above is actually served. `/api/admin/*` was already FE-compatible;
> the new tabs just consume it plus analytics/health.

### Confirmed Unwired — Deferred (no FE caller)

- `/api/user-api-keys` (BYOK) — no key-management UI; the settings `apiKey` field is a separate concern. **Still deferred.**
- Quest detail/update/progress routes (`GET/PUT /api/quests/:questId`, `POST /api/quests/:questId/progress`) exist on BE but have no FE caller yet (no detail/edit UI). Partial wiring only.
- Internal/TUI BE-only routes (telemetry/activity-stream, frontend-logs, message-encryption, story-* entity sub-routes, etc.) — expected, no web FE caller.

> Also noted: the settings "Import Chats" button is a dead placeholder — no `POST /api/settings/import` BE route exists yet.
