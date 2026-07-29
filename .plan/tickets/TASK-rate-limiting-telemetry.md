# TASK: Rate Limiting & Telemetry

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-api-governance.md

## Summary

Implement rate limiting, telemetry collection, and monitoring dashboards.

## Tasks

### Rate Limiting

- [ ] Implement sliding window algorithm (`src/api-governance/rate-limiting/algorithms.ts`)
- [ ] Add token bucket algorithm
- [ ] Create rate limit store (Redis, SQLite)
- [ ] Implement per-user/per-IP limits
- [ ] Add burst handling
- [ ] Create rate limit policies

### Telemetry

- [ ] Implement metrics collector (`src/api-governance/telemetry/collector.ts`)
- [ ] Add latency tracking
- [ ] Create error rate monitoring
- [ ] Implement distributed tracing
- [ ] Add Prometheus export

### Monitoring Dashboards

- [ ] Create rate limit dashboard
- [ ] Add metrics dashboard
- [ ] Implement tracing dashboard
- [ ] Create alerting system

### Offloading

- [ ] Implement task queue (`src/api-governance/offloading/queue.ts`)
- [ ] Add background worker
- [ ] Create disk offload (/tmp, mktemp)
- [ ] Implement batch reconciliation
- [ ] Add task status API

## Files

- `src/api-governance/rate-limiting/algorithms.ts`
- `src/api-governance/rate-limiting/limiter.ts`
- `src/api-governance/telemetry/collector.ts`
- `src/api-governance/telemetry/tracing.ts`
- `src/api-governance/offloading/queue.ts`
- `src/api-governance/offloading/worker.ts`

## Verification

```bash
# Test rate limiting
for i in {1..100}; do
  curl -s http://localhost:3000/api/chat \
    -H "Content-Type: application/json" \
    -d '{"model":"test","messages":[]}' | jq '.error'
done

# Get rate limit status
curl http://localhost:3000/api/rate-limit/status

# Get metrics
curl http://localhost:3000/api/metrics

# Get task queue status
curl http://localhost:3000/api/tasks
```
