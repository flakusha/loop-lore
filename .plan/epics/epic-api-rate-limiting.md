<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: API Rate Limiting

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** rate-limiting, sliding-window, token-bucket, redis, sqlite
**Parent Epic:** API Governance (epic-api-governance.md)

## Summary

Rate limiting for production APIs: sliding-window and token-bucket algorithms,
a pluggable store (Redis or SQLite), tiered per-user/per-IP limits, burst
handling, and a rate-limit dashboard. Prevents abuse of generation endpoints.

## Sub-Epic of

Part of the **API Governance** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- Sliding window algorithm
- Token bucket algorithm
- Rate limit store (Redis, SQLite)
- Per-user / per-IP limits (tiered)
- Burst handling
- Rate limit dashboard

## Design

### Sliding Window

```typescript
import { SlidingWindowLimiter, } from "./rate-limiting/algorithms";

const limiter = new SlidingWindowLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  store: "redis", // or 'sqlite'
},);

// Apply to route
app.use("*", limiter.middleware(),);
```

### Token Bucket

```typescript
import { TokenBucketLimiter, } from "./rate-limiting/algorithms";

const limiter = new TokenBucketLimiter({
  capacity: 100,
  refillRate: 10, // tokens per second
  refillInterval: 1000,
},);

// Apply to route
app.use("*", limiter.middleware(),);
```

### Tiered Per-User Limits

```typescript
// Different limits per user tier
const limits = {
  free: { requests: 60, window: 60, },
  pro: { requests: 600, window: 60, },
  enterprise: { requests: 6000, window: 60, },
};

// Apply user tier limits
app.use("*", (c, next,) => {
  const tier = c.user?.tier || "free";
  return limiter.limit(limits[tier],)(c, next,);
},);
```

| Algorithm      | Use Case          |
| -------------- | ----------------- |
| Sliding Window | General purpose   |
| Token Bucket   | Burst handling    |
| Per-User       | Tier-based limits |

## Tasks

- [ ] Implement sliding window algorithm
- [ ] Add token bucket algorithm
- [ ] Create rate limit store (Redis, SQLite)
- [ ] Add per-user/per-IP limits
- [ ] Implement burst handling
- [ ] Build rate limit dashboard

## Dependencies

- Parent hub: **API Governance** (`epic-api-governance.md`) — owns the shared layout, the `/api/rate-limit/status` endpoint, and governance REST surface.
- Siblings: requires `epic-api-validation-guardrails.md` to land first; mutually independent with `epic-api-telemetry.md` and `epic-api-task-offloading.md` afterwards.

## Files

- `src/api-governance/rate-limiting/limiter.ts` — Rate limiter
- `src/api-governance/rate-limiting/algorithms.ts` — Sliding window, token bucket
- `src/api-governance/rate-limiting/store.ts` — Rate limit store
- `src/api-governance/rate-limiting/policies.ts` — Rate limit policies

## Notes

- Redis preferred for high-throughput deployments; SQLite as the zero-dependency default
- Burst handling via token bucket on top of steady-state sliding window
