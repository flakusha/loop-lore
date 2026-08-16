# TASK: Admin Revisions — Diff & Revert

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** High
**Epic:** epic-frontend-admin
**Spec:** `docs/frontend/admin.md` §Revision History

## Summary

Entity change tracking for worlds, locations, characters, items, notes, chat settings. Revision table with before→after diff view (side-by-side + unified) and revert with confirmation. Revert creates a new revision (no data loss).

## Backend

- Revision capture: hook entity create/update/delete paths to write revision rows (entity type, entity id, field, action, before, after, user, timestamp)
- `GET /api/admin/revisions` — paginated, filterable (entity type, user, date range)
- `GET /api/admin/revisions/:id/diff` — structured before/after
- `POST /api/admin/revisions/:id/revert` — restore prior values as a NEW revision; rules: 30-day revert window (configurable), cannot revert deletions, admin reverts any, user reverts own only
- Retention configurable per entity type

## Frontend

- Admin tab "Revisions" in `src/views/admin.html` + `src/frontend/alpine/admin-revisions.ts`
- Revision table (timestamp, user, entity, field, action, preview, view-diff/revert)
- Diff view: side-by-side with green/red/yellow highlights + unified toggle
- Revert confirmation dialog showing the diff

## Acceptance Criteria

- [ ] Revision rows written on entity create/update/delete
- [ ] Revision list with filters
- [ ] Diff view (side-by-side + unified)
- [ ] Revert restores prior state as new revision, respects 30-day window
- [ ] Deletion revert blocked
- [ ] Tests passing
- [ ] Documentation updated