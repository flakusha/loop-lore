# TASK: Analytics Frontend Dashboard

**Status:** ⬜ Not Started
**Priority:** P1
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** analytics, frontend, dashboard, metrics

## Summary

Create an analytics dashboard frontend for conversation analytics, model comparison, and cost tracking. Backend routes exist at `/api/analytics/*` but no frontend UI exists.

## Backend Routes (already exist)

| Route                                    | Method | Purpose                                                  |
| ---------------------------------------- | ------ | -------------------------------------------------------- |
| `/api/analytics/chat/:chatId`            | GET    | Per-chat analytics (message count, token usage, latency) |
| `/api/analytics/overview`                | GET    | Aggregate stats (total messages, tokens, latency, cost)  |
| `/api/analytics/comparisons`             | POST   | Submit model comparison                                  |
| `/api/analytics/comparisons`             | GET    | List recent comparisons                                  |
| `/api/analytics/comparisons/leaderboard` | GET    | Aggregated model comparison stats                        |

## Files to Create

- `src/frontend/alpine/analytics.ts` — Alpine.js analytics component
- `src/components/analytics/dashboard.html` — Analytics dashboard template
- `src/frontend/pages/analytics.ts` — Page-specific analytics code

## Acceptance Criteria

- [ ] Per-chat analytics view (message count, token usage, latency)
- [ ] Overview dashboard with aggregate stats
- [ ] Model comparison list and submission
- [ ] Leaderboard view
- [ ] Charts/graphs for token usage over time
- [ ] Cost tracking display

## Related

- `epic-analytics-observability.md` — Analytics epic
- `TASK-analytics-observability.md` — Existing task (needs updating)
