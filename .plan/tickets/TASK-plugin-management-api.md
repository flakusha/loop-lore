# TASK: Plugin Management API — Install, List, Enable, Disable

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Parent:** Epic 2026-11 (Admin & Settings)
**Blocked by:** None

## Summary

Plugin management API for installing, listing, enabling, and disabling plugins. Plugin skeleton exists (`src/plugins/`) but no management API.

## What Exists

- `src/plugins/loader.ts` — plugin loader (loads files)
- `src/plugins/registry.ts` — plugin registry
- `src/plugins/types.ts` — plugin types

## What's Missing

- Install plugin (from file/URL)
- List installed plugins
- Enable/disable plugins
- Plugin discovery endpoint
- Plugin configuration UI

## Tasks

- [ ] `GET /api/plugins` — list installed plugins
- [ ] `POST /api/plugins/install` — install plugin (multipart upload)
- [ ] `POST /api/plugins/:id/enable` — enable plugin
- [ ] `POST /api/plugins/:id/disable` — disable plugin
- [ ] `GET /api/plugins/discover` — discover available plugins
- [ ] `DELETE /api/plugins/:id` — uninstall plugin
- [ ] Plugin config schema validation
- [ ] Admin UI: plugin manager tab

## Files to Create

- `src/routes/plugins.ts` — plugin management API
- `src/frontend/alpine/admin-plugins.ts` — admin UI

## Files to Modify

- `src/plugins/loader.ts` — install/uninstall support
- `src/plugins/registry.ts` — enable/disable state
- `src/frontend/alpine/admin.ts` — wire plugin tab

## Risk

Low — plugin skeleton exists, just needs API wiring.
