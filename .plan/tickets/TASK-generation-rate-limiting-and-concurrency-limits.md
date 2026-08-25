# TASK: Generation rate limiting and concurrency limits

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Task
**Tags:** generation, rate-limit, concurrency, semaphore, flow-control
**Epic:** epic-generation-flow-control.md
**Related:** TASK-admin-generation-controls-runtime-surface.md

## Summary

No regulation on generation routes: middleware/rate-limit.ts sliding window used only by auth; concurrency unbounded (only per-chat idempotency). Add: (1) concurrency semaphore over the cancellation-tracker registry with per-user/per-chat/global tiers, configurable via generation.limits in config schema + env-map entries; (2) request-rate limits reusing createRateLimiter keyed per-user with per-IP fallback, 429 + Retry-After headers (reuse rateLimitHeaders); (3) reject-fast default with structured error body, optional queue-hold mode per scope as config policy. Provider-side backoff/circuit-breaker stays untouched. Epic: epic-generation-flow-control

## Acceptance Criteria
+- [ ] Concurrency semaphore over the cancellation-tracker registry with per-user / per-chat / global tiers
+- [ ] Request-rate limits reusing createRateLimiter keyed per-user (per-IP fallback), 429 + Retry-After via existing rateLimitHeaders
+- [ ] Config surface: generation.limits in src/config/schema/generation.ts + env-map entries; no new ad-hoc env vars
+- [ ] Reject-fast default with structured error body; optional queue-hold mode per scope as config policy
+- [ ] Provider backoff/circuit-breaker behavior unchanged (no double-throttling)
+- [ ] Tests: concurrency cap enforced across scopes; rate limit returns 429 + headers; config defaults documented
