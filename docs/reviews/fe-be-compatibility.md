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

**Status: All 23 issues resolved.** Remaining ~110 BE-only routes are expected: TUI endpoints, internal APIs (telemetry, activity-stream, frontend-logs, message-encryption, api-keys, story-* entity sub-routes, etc.) have no web FE caller.

---

## Issues (23) — All Resolved

### 1. Method Mismatches (8)

FE called GET, BE expected POST/PUT. All resolved by changing FE to correct method.

| FE Call (original)                  | BE Route                           | Fix                                                 |
| ----------------------------------- | ---------------------------------- | --------------------------------------------------- |
| `GET /api/chats/batch/archive`      | `POST /api/chats/batch/archive`    | FE→POST                                             |
| `GET /api/chats/batch/delete`       | `POST /api/chats/batch/delete`     | FE→POST                                             |
| `GET /api/chats/batch/export`       | `POST /api/chats/batch/export`     | FE→POST                                             |
| `GET /api/chats/:id/mark-read`      | `PUT /api/chats/:id/mark-read`     | FE→PUT                                              |
| `GET /api/chats/:id/read`           | No matching route                  | FE→PUT mark-read                                    |
| `GET /api/admin/providers/rescan`   | `POST /api/admin/providers/rescan` | FE→POST                                             |
| `DELETE /api/chats/:id/impersonate` | Only `PUT` exists                  | FE→PUT with null                                    |
| `GET /api/generation/*`             | All `POST` on BE                   | False positive — Alpine uses `apiFetch()` with POST |

### 2. Path Mismatches (2)

| FE Call                          | BE Route                                 | Fix                        |
| -------------------------------- | ---------------------------------------- | -------------------------- |
| `GET /api/messages/:id/variant`  | `GET /api/messages/:id/variants`         | FE→`/variants` (plural)    |
| `GET /api/plugins/:name/:action` | `POST /api/plugins/:name/enable/disable` | FE→explicit enable/disable |

### 3. Missing BE Routes (6)

| FE Call                            | Resolution                           |
| ---------------------------------- | ------------------------------------ |
| `GET /api/admin/model-roles/:role` | Added GET route                      |
| `GET /api/admin/users/:id/role`    | Already existed (PATCH), verified    |
| `GET /api/users/me/settings`       | Added `PATCH /api/users/me/settings` |
| `PATCH /api/worlds/:id`            | FE→PUT (BE already had)              |
| `POST /api/actors/import`          | Exists via `onRequest` hook          |
| `GET /api/chats/:id/persona`       | Exists via PUT, verified compatible  |

### 4. DELETE Route Coverage — All Verified

All 9 DELETE operations have FE coverage. `system-config/:key` delete was the only gap — now resolved.

---

## Compatible Routes (40)

All FE calls with matching BE routes and correct methods:

`GET/POST /api/actors`, `GET /api/actors/:id`, `GET /api/admin/*`, `GET /api/assets`, `GET /api/auth/me`, `GET /api/chats`, `GET /api/chats/:id`, `GET /api/chats/:id/messages`, `GET /api/chats/:id/participants`, `GET /api/chats/:id/encryption-key`, `GET /api/chats/activity`, `GET /api/generation/status/:chatId`, `GET /api/messages/:id`, `GET /api/personas`, `GET /api/personas/:id`, `GET /api/plugins`, `GET /api/settings`, `PATCH /api/settings`, `GET /api/users/me`, `PUT /api/users/me`, `DELETE /api/users/me`, `GET /api/worlds/:id`, `PUT /api/worlds/:id`, `DELETE /api/worlds/:id`, `GET /api/worlds/:id/locations`, `POST /api/worlds/:id/locations`, `GET /api/worlds/:id/locations/:locId`, `DELETE /api/worlds/:id/locations/:locId`, `POST /api/actors`, `POST /api/actors/import`, `POST /api/assets`, `POST /api/auth/login`, `POST /api/demo-login`, `POST /api/worlds/:id/locations`, `DELETE /api/personas/:id`, all generation POST routes, message variant PUT route.

---

## Wiring Update (2026-07-16)

Newly wired FE↔BE:

| FE Call                                | BE Route                               |
| -------------------------------------- | -------------------------------------- |
| `POST /api/auth/logout`                | `POST /api/auth/logout`                |
| `GET /api/settings/export`             | `GET /api/settings/export`             |
| `GET /api/telemetry/analytics/summary` | `GET /api/telemetry/analytics/summary` |
| `GET /api/telemetry/analytics/daily`   | `GET /api/telemetry/analytics/daily`   |
| `GET /api/telemetry/analytics/errors`  | `GET /api/telemetry/analytics/errors`  |
| `POST /api/telemetry/analytics/purge`  | `POST /api/telemetry/analytics/purge`  |
| `GET /api/health`                      | `GET /api/health`                      |
| `GET /api/worlds/:id/quests`           | `GET /api/worlds/:id/quests`           |
| `POST /api/worlds/:id/quests`          | `POST /api/worlds/:id/quests`          |
| `DELETE /api/quests/:questId`          | `DELETE /api/quests/:questId`          |

### Confirmed Unwired (Deferred)

- `/api/user-api-keys` (BYOK) — no key-management UI
- Quest detail/update/progress routes — partial wiring only
- Internal/TUI BE-only routes — expected, no web FE caller
- Settings "Import Chats" — dead placeholder, no `POST /api/settings/import` exists
