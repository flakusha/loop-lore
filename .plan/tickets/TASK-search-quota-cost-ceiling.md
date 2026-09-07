<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Search Quota + Cost Ceiling (per-user / per-chat)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Feature Task
**Tags:** search, quota, cost, rate-limit, per-user, per-chat
**Epic:** epic-assistant-entity-access.md (extends quota engine), epic-rag-context-sources

## Summary

Per-user + per-chat quota on search operations: max queries/hour, max results/query, max USD/day for paid providers. Pre-call enforcement (refuse with 429 before dispatch). Composes with `TASK-rag-search-robots-quota.md` rate limiter and `TASK-search-service-unified.md` 3-tier time-cap config.

## Why this task exists (the gap)

`TASK-assistant-entity-access-rag-access.md` mentions quota enforcement but doesn't define per-user/per-chat quotas specifically for search. The user explicitly asked: "configurable request time capping - global, admin, user, etc" — extending to "result quota + cost ceiling per user/chat" is the natural next step.

## Design

### Schema

```sql
CREATE TABLE search_quotas (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL,    -- 'user' | 'chat' | 'global'
  scope_id TEXT,                -- userId, chatId, or null for global
  max_queries_per_hour INTEGER NOT NULL DEFAULT 60,
  max_results_per_query INTEGER NOT NULL DEFAULT 100,
  max_cost_usd_per_day REAL,    -- null = no cost ceiling
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Pre-call check

```ts
// src/search/quota.ts
export async function checkSearchQuota(
  userId: string,
  chatId: string,
  requestedResults: number,
  provider: string,
): Promise<QuotaDecision>;

export type QuotaDecision =
  | { allowed: true; remaining: { queries: number; costUsd: number } }
  | { allowed: false; reason: "queries-per-hour" | "cost-per-day" | "results-per-query"; resetAt: number };
```

### Admin UI

- Per-scope editor: `/admin/search/quotas` — set per-user, per-chat, global defaults.
- Read-only roll-up at `/moderator/search/quotas` — current usage vs ceiling.

## Files

- `src/db/migrations/parts/NNN_search_quotas.ts` — `search_quotas` table
- `src/search/quota.ts` — `checkSearchQuota`, `QuotaDecision`
- `src/routes/admin/search-quotas.ts` — admin endpoints
- `src/routes/moderator/search-quotas.ts` — moderator endpoints
- `src/search/quota.test.ts` — pre-call enforcement tests

## Acceptance Criteria

- [ ] Per-user / per-chat / global quota rows editable
- [ ] Pre-call check refuses with `QuotaExceededError` + reset-at timestamp
- [ ] Per-paid-provider cost ceiling enforced
- [ ] Admin UI + moderator UI match design tokens
- [ ] Quota decision logged to telemetry (`src/search/telemetry.ts`)

## Dependencies

- Builds on: `TASK-rag-search-robots-quota.md` (rate limiter)
- Builds on: `TASK-assistant-entity-access-quota-engine` (existing quota framework)
- Bridges: `epic-api-rate-limiting.md` (existing rate-limit infrastructure)
