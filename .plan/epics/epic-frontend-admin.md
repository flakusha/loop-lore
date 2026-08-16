# EPIC: Admin Panel & Dashboard

**Status:** 🟡 Partial — backend routes + frontend shell shipped (11 tabs); Content Review queue + Revisions + spec gaps open
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
| Content Review queue   | ❌     | Spec `docs/frontend/admin.md` §Content Review — no tab, no route |
| Revisions (diff/revert)| ❌     | Spec §Revision History — no tab, no route            |
| Factory reset / danger zone | ❌ | Spec §Danger Zone — not implemented                  |

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

### Content Review (`/admin/review`) — ❌ not implemented

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
- Create: `TASK-admin-content-review-queue.md` — flagged-content queue + review actions + auto-moderation rules
- Create: `TASK-admin-revisions-diff-revert.md` — entity revision tracking + diff view + revert
- Create: `TASK-admin-danger-zone.md` — factory reset / purge / reset-settings (confirmation-gated)
- Create: `TASK-admin-overview-dashboard.md` — summary cards + recent activity + auto-poll

## Related Epics

- `docs/frontend/admin.md` — UX spec (authoritative)
- `epic-auth-access.md` — admin role gating (`isAdminRole` middleware)
- `epic-frontend-settings.md` — settings UI (adjacent surface)
- `epic-logging-telemetry.md` — audit log data source