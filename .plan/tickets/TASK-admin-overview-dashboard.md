# TASK: Admin Overview Dashboard

**Status:** ✅ Done — BE `src/routes/admin/stats.ts` (worlds + daily deltas), FE `admin.ts` (overview state, 30s poll, filters) + `admin.html` overview tab (clickable stat cards with delta badges, activity feed w/ q + event_type filters)
**Priority:** medium
**Effort:** Low
**Epic:** epic-frontend-admin
**Spec:** `docs/frontend/admin.md` §Overview Dashboard

## Summary

Admin overview tab: summary metric cards (users/chats/worlds/assets with daily deltas), 30s auto-poll, recent-activity feed (last 20 actions, filterable by user and type).

## Backend

- Extend `src/routes/admin/stats.ts` with: daily deltas (users/chats/worlds/assets created today), recent activity feed (join audit log with entity names)

## Frontend

- Overview tab in `src/views/admin.html` (exists) — populate with metric cards + activity feed
- `src/frontend/alpine/admin.ts` — 30s auto-poll, click-card → jump to section
- Activity feed filterable by user and action type

## Acceptance Criteria

- [ ] Metric cards with daily deltas
- [ ] Auto-poll every 30s
- [ ] Recent activity feed (last 20, filterable)
- [ ] Card click navigates to section
- [ ] Tests passing
- [ ] Documentation updated