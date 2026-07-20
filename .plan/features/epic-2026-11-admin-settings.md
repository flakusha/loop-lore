# Epic 2026-11: Admin & Settings

**Status:** In Progress (P1)
**Priority:** Medium
**Source:** docs/meta/backlog.md

## Summary

Admin UI, per-user preferences, plugin management. Blocks multi-user deployment.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| FEAT-2026-015 | Admin Statistics & Moderation | Medium | Not Started |
| TASK-epic11-admin-settings-reconciliation.md | Admin & Settings reconciliation | Medium | Not Started |

## Implementation Plan

### Phase 1: Admin Middleware & Routes
- [ ] Admin middleware gate (`src/middleware/admin-gate.ts`)
- [ ] Admin page routes (`src/routes/admin.ts`)
- [ ] Admin settings tabs (`src/views/admin/`)

### Phase 2: User Preferences
- [ ] Runtime config table
- [ ] Per-user settings API (`src/routes/settings.ts`)
- [ ] User preferences modal

### Phase 3: Plugin Management
- [ ] Plugin management API (install/list/enable/disable)
- [ ] Plugin discovery endpoint

## Files

- `src/middleware/admin-gate.ts` — Admin middleware
- `src/routes/admin.ts` — Admin routes
- `src/routes/settings.ts` — User preferences
- `src/routes/plugins.ts` — Plugin management
- `src/views/admin/` — Admin UI views
- `src/components/modals/settings.html` — Settings modal