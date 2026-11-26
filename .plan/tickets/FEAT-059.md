---
title: "FEAT-059: Conversation analytics dashboard"
status: Done
priority: medium
labels: [feature, analytics, frontend]
epic: epic-analytics-observability
related: [FEAT-062, FEAT-060, FEAT-068]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Summary:** Conversation analytics dashboard shipped across overview, per-chat, character, quality, and admin surfaces.
**Context:** Implementation predated the usage-statistics research; status reconciled against mounted routes, frontend components, and tests on 2026-11-24.
**Acceptance Criteria:** All criteria below are implemented and covered by route/component tests.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-059: Conversation analytics dashboard

## What

A dashboard view showing conversation metrics: message counts by role, token usage over time, conversation length distribution, active hours, and generation latency trends.

## Why

Users managing multiple chats and characters need visibility into usage patterns. Which characters consume the most tokens? When are conversations longest? How does generation latency trend? This data helps users optimize their setup (model choice, context settings, character card size).

## Current State

- `src/routes/analytics/` implements overview, per-chat, character, and quality rollups; routes are mounted and tested.
- `src/frontend/alpine/admin-analytics.ts` and `src/components/admin/analytics-panel.html` render the admin dashboard.
- `src/frontend/alpine/chat/analytics.ts` renders the per-chat analytics panel.
- Metrics are computed from existing message/generation facts; no duplicate `chat_metrics` table was introduced.

## Acceptance Criteria

- [x] **Metrics collection** — track per-chat: message count (user/assistant/system), total tokens used, average message length, generation latency (ms), active time span
- [x] **`/api/analytics/overview`** — returns aggregate stats across all chats: total messages, total tokens, top 5 chats by token usage, average session length
- [x] **`/api/analytics/chats/:id`** — returns per-chat detailed metrics with optional date range filter
- [x] **Dashboard page** — admin analytics tab with message volume, token usage by role, and latency distribution
- [x] **Character comparison** — table comparing characters by total messages, average response length, token efficiency
- [x] Unit tests for metrics aggregation queries

## Implementation Notes

- Implemented with on-the-fly queries over existing message/generation facts; no duplicate `chat_metrics` table.
- Dashboard uses Alpine.js and CSS-based bars; no chart library dependency.
- Dashboard: Alpine.js component with lightweight chart rendering (CSS-based bars, no chart library dependency)
- API: single `analytics` route file under `src/routes/`
- Date range: ISO string params, default last 30 days
- Size gate: analytics files <250L each


## Verification

- `src/routes/analytics.test.ts` covers overview, date filtering, per-chat, and character rollups.
- `src/frontend/alpine/admin-analytics.test.ts` and `src/frontend/alpine/chat/analytics.test.ts` cover dashboard projection and per-chat state.

## Dependencies

- Blocked by: nothing
- Blocks: FEAT-062 (generation quality metrics extends this data)

**Resolved:** 2026-11-24 registry-driven close: git issue dd8e05d (registry tip: 12786748d Konstantin Fedotov Close issue)
