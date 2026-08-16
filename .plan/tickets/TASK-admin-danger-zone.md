# TASK: Admin Danger Zone — Factory Reset & Purge

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Low
**Epic:** epic-frontend-admin
**Spec:** `docs/frontend/admin.md` §Danger Zone

## Summary

Danger-zone actions in admin system tab: purge all audit logs, reset all settings, factory reset (full data wipe). All confirmation-gated with typed confirmation strings.

## Backend

- `POST /api/admin/audit/purge` — requires `"PURGE"` confirmation; permanent, logged before purge
- `POST /api/admin/settings/reset` — requires `"RESET"`; restores defaults, audit-logged
- `POST /api/admin/factory-reset` — requires `"DELETE ALL"`; full data wipe (chats, messages, worlds, assets, users), audit trail of the reset itself, then re-seed minimal admin

## Frontend

- Danger Zone section in `src/frontend/alpine/admin-system.ts` + `src/views/admin.html` system tab
- Confirmation inputs (typed string match required, button disabled until match)
- Post-reset redirect to setup/register flow

## Acceptance Criteria

- [ ] Typed-confirmation gating on all three actions
- [ ] Audit purge permanent + logged
- [ ] Settings reset restores defaults
- [ ] Factory reset wipes data and re-seeds admin
- [ ] Tests passing
- [ ] Documentation updated