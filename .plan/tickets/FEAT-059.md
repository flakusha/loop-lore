---
title: "FEAT-059: Conversation analytics dashboard"
status: open
priority: medium
labels: [feature, analytics, frontend]
epic: epic-analytics-observability
related: [FEAT-062, FEAT-060, FEAT-068]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-059: Conversation analytics dashboard

## What

A dashboard view showing conversation metrics: message counts by role, token usage over time, conversation length distribution, active hours, and generation latency trends.

## Why

Users managing multiple chats and characters need visibility into usage patterns. Which characters consume the most tokens? When are conversations longest? How does generation latency trend? This data helps users optimize their setup (model choice, context settings, character card size).

## Current State

- `src/telemetry/` — telemetry service with `trackTelemetry()` for page views + events
- `src/chat/context-stats.ts` — per-message context stats
- `src/frontend/alpine/context-window.ts` — real-time token display
- No persistent conversation metrics or dashboard UI

## Acceptance Criteria

- [ ] **Metrics collection** — track per-chat: message count (user/assistant/system), total tokens used, average message length, generation latency (ms), active time span
- [ ] **`/api/analytics/overview`** — returns aggregate stats across all chats: total messages, total tokens, top 5 chats by token usage, average session length
- [ ] **`/api/analytics/chats/:id`** — returns per-chat detailed metrics with optional date range filter
- [ ] **Dashboard page** — new admin/dashboard route with charts: message volume (line chart), token usage (stacked bar by role), latency distribution (histogram)
- [ ] **Character comparison** — table comparing characters by total messages, average response length, token efficiency
- [ ] Unit tests for metrics aggregation queries

## Implementation Notes

- New `chat_metrics` table: `chat_id`, `role`, `token_count`, `latency_ms`, `created_at` (aggregated on message create)
- Or: compute on-the-fly from existing `messages` table + `generation_logs` (if exists) — avoid duplicate storage
- Dashboard: Alpine.js component with lightweight chart rendering (CSS-based bars, no chart library dependency)
- API: single `analytics` route file under `src/routes/`
- Date range: ISO string params, default last 30 days
- Size gate: analytics files <250L each

## Dependencies

- Blocked by: nothing
- Blocks: FEAT-062 (generation quality metrics extends this data)
