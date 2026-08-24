<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Admin Panel & Dashboard

**Status:** 🟢 Near-complete — 12 tabs + user Flag button/dialog shipped; remaining gap: Revision History
**Priority:** Medium
**Effort:** Medium
**Type:** Frontend Epic

## Summary

Frontend implementation for Admin Panel & Dashboard. See `docs/frontend/admin.md` for UX specification.

## What Exists Now (verified 2026-08-16)

| Component              | Status | Location                                             |
| ---------------------- | ------ | ---------------------------------------------------- |
| Admin route bundle     | ✅     | `src/routes/admin/index.ts` (11 sub-route groups)    |
| Users mgmt (list/detail/role/delete) | ✅ | `src/routes/admin/users.ts` + `src/frontend/alpine/admin-users.ts` |
| Stats / overview       | ✅     | `src/routes/admin/stats.ts`                          |
| Providers + health     | ✅     | `src/routes/admin/providers.ts` + `admin-models/`    |
| Model roles            | ✅     | `src/routes/admin/model-roles.ts`                    |
| SD status              | ✅     | `src/routes/admin/sd-status.ts`                      |
| System config          | ✅     | `src/routes/admin/system-config.ts` + `admin-system.ts` |
| Worlds mgmt            | ✅     | `src/routes/admin/worlds.ts` + `admin-worlds.ts`     |
| Chats mgmt             | ✅     | `src/routes/admin/chats.ts` + `admin-chats.ts`       |
| Templates mgmt         | ✅     | `src/routes/admin/templates.ts` + `admin-templates.ts` |
| Audit log              | ✅     | `src/routes/admin/audit.ts` + `admin-audit.ts`       |
| Key rotation           | ✅     | `src/routes/admin/key-rotation.ts`                   |
| Character overrides    | ✅     | `src/routes/admin-character-overrides/` (open: frontend `TASK-admin-character-overrides-frontend`) |
| NSFW admin             | ✅     | `src/routes/admin-nsfw/`                             |
| Admin view shell       | ✅     | `src/views/admin.html` (11 tabs) + `src/frontend/alpine/admin.ts` |
| Content Review queue   | ✅ | Service `src/nsfw/moderation-service/` (flagContent/getFlagQueue/resolveFlag/mute/ban/shadow) + routes `src/routes/nsfw-moderation/{flags,actions,audit,overrides}.ts` + admin Review tab (`admin.html` + `admin-review.ts`) + `review-stats.ts` + **user Flag button/dialog** (message context menu + Detailed action row → `POST /api/nsfw/moderation/flags`; reporter identity session-derived, hardened `flags.routes.test.ts`) |
| Revisions (diff/revert)| ❌ | Spec §Revision History — no tab, no route            |
| Factory reset / danger zone | ✅ | `src/routes/admin/danger-zone.ts` (purge/reset/factory-reset) + `admin.html` §Danger Zone + `admin-system.ts` `runDangerAction` (confirmation-gated) |

## Scope (from `docs/frontend/admin.md`)

### Overview Dashboard

- Summary cards (users/chats/worlds/assets + deltas), 30s auto-poll, recent activity (last 20 actions, filterable)

### User Management (`/admin/users`)

- Sortable/filterable user table (role, status, chats, messages, last seen, created)
- Bulk actions (change role, disable, delete) + confirmation dialogs
- User detail panel: sessions (revoke all), API keys (revoke/add), owned chats, edit profile, reset password, disable/delete account
- Create user (username 3-32 alphanumeric+underscore, pw ≥8, role)

### Chat Management (`/admin/chats`)

- Sortable/filterable chat table (type, owner, world, messages, participants, status)
- Bulk archive/delete/change-world
- Chat detail: participants mgmt, recent messages, archive/delete/export/change-world/audit-log
- Chat moderation: freeze chat, mute user, view flagged messages, inject system message

### World Management (`/admin/worlds`)

- Sortable/filterable world table (owner, locations, characters, chats, assets, status)
- World detail: locations/characters/chats/assets lists, permissions mgmt
- World permissions (owner/editor/viewer/none) + system-role × world-permission matrix
- Sharing UI (add user w/ permission, public link toggle)
- Create world wizard (admin pre-configures owners/permissions)

### Audit Log (`/admin/audit`)

- Chronological admin+user action log (8 categories: auth/user/chat/world/permissions/assets/system/moderation)
- Filters: user, action type, target type, date range, IP, free-text
- Log detail: target uuid, details, IP, session; restore/view/export actions
- Retention: 90 days default, configurable; immutable for non-admins

### Content Review (`/admin/review`) — ✅ shipped (service+routes+tab+flag button); auto-mod rules optional follow-on

- Flagged content queue (message/asset/note), flag dialog (reason presets + other)
- Review queue: keep / add spoiler tag / delete / mute user / dismiss flag
- Auto-moderation rules (max-flags auto-hide, profanity, spam, spoiler auto-tag)
- Moderation reports (flags/day, most-flagged users/chats, resolution time, false-positive rate)

### System Configuration (`/admin/system`)

- General: app name, registration open, session timeout, max sessions/user, max upload, log retention
- LLM: default provider/model, max context tokens, temperature, rate limit
- Moderation toggles
- Danger zone: purge audit logs, reset settings, factory reset (confirmation-gated)

### Revision History (`/admin/revisions`) — ❌ not implemented

- Entity change tracking (worlds/locations/characters/items/notes/chat settings)
- Diff view (side-by-side + unified), revert (30-day window, new revision on revert)
- Retention configurable per entity type

## Tickets

- `TASK-admin-character-overrides-frontend.md` — open: frontend for character overrides
- `TASK-epic11-admin-settings-reconciliation.md` — ✅ complete (reconciliation)
- `TASK-admin-content-review-queue.md` — ✅ done (review queue + **user Flag button/dialog** + reporter-identity hardening)
- `TASK-admin-danger-zone.md` — ✅ done (danger-zone.ts + admin.html §Danger Zone + admin-system.ts)
- `TASK-admin-overview-dashboard.md` — ✅ done (stats.ts deltas + admin.ts 30s poll + overview tab)
- `TASK-admin-revisions-diff-revert.md` — ⬜ **open** (only remaining admin gap; entity revision tracking + diff + revert)

## Related Epics

- `docs/frontend/admin.md` — UX spec (authoritative)
- `epic-auth-access.md` — admin role gating (`requirePermission("admin.system")` / `adminViewGuard`)
- `epic-frontend-settings.md` — settings UI (adjacent surface)
- `epic-logging-telemetry.md` — audit log data source