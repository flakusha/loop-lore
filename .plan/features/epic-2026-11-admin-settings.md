# Epic 2026-11: Admin & Settings

**Status:** ✅ Complete (core, reconciled 2026-07-19)
**Priority:** —
**Source:** docs/meta/backlog.md

## Summary

Admin UI, per-user preferences, plugin management. **Core already implemented.**

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| TASK-epic11-admin-settings-reconciliation.md | Admin & Settings reconciliation | — | ✅ Complete |
| TASK-plugin-management-api | Plugin management API (install/enable/disable) | Medium | Not Started |

## Implementation Plan

### Phase 1: Admin Middleware & Routes
- [x] Admin middleware gate (`src/middleware/admin-gate.ts`)
- [x] Admin page routes (`src/routes/admin.ts`)
- [x] Admin settings tabs (`src/views/admin/`) — 10 tabs: overview, users, worlds, chats, audit, models, plugins, system, analytics, health

### Phase 2: User Preferences
- [x] Runtime config table
- [x] Per-user settings API (`src/routes/settings.ts`)
- [x] User preferences modal (`src/components/modals/settings.html`)

### Phase 3: Plugin Management
- [ ] Plugin management API (install/list/enable/disable) — **new ticket**
- [ ] Plugin discovery endpoint — **new ticket**

## Files

- `src/middleware/admin-gate.ts` — Admin middleware
- `src/routes/admin.ts` — Admin routes
- `src/routes/settings.ts` — User preferences
- `src/routes/plugins.ts` — Plugin management
- `src/views/admin/` — Admin UI views
- `src/components/modals/settings.html` — Settings modal