<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# API Governance — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-api-governance.md` (hub — split into 5 sub-epics)
**Status:** Not Started
**Priority:** High
**Effort:** Very High (split into 5 sub-epics)
**Type:** Infrastructure Epic
**Tags:** openapi, validation, rate-limiting, telemetry, offloading

**Sub-Epics:** `epic-api-openapi.md` · `epic-api-validation-guardrails.md` · `epic-api-rate-limiting.md` · `epic-api-telemetry.md` · `epic-api-task-offloading.md`

## Architecture

```
src/api-governance/
├── openapi/                  # OpenAPI specification
│   ├── generator.ts          # Auto-generate from Elysia
│   ├── validator.ts          # Spec validation
│   └── docs.ts               # Swagger UI
├── validation/               # Request validation
│   ├── schema.ts             # TypeBox schemas
│   ├── validator.ts          # Request validator
│   └── guardrails.ts         # AI guardrails
├── rate-limiting/            # Rate limiting
│   ├── algorithms.ts         # Sliding window, token bucket
│   ├── store.ts              # Rate limit store
│   └── policies.ts           # Per-user/tier limits
├── telemetry/                # API telemetry
│   ├── collector.ts          # Metrics collector
│   ├── tracing.ts            # Distributed tracing
│   └── dashboards.ts         # Monitoring
└── offloading/               # Resource offloading
    ├── queue.ts              # Task queue
    ├── worker.ts             # Background worker
    ├── disk.ts               # Disk offload
    └── reconciliation.ts     # Batch reconciliation
```

## OpenAPI

- **Auto-generation**: Extract from Elysia routes
- **Validation**: Lint spec, detect breaking changes
- **Documentation**: Swagger UI, Redoc

## Rate Limiting

| Algorithm      | Use Case          |
| -------------- | ----------------- |
| Sliding Window | General purpose   |
| Token Bucket   | Burst handling    |
| Per-User       | Tier-based limits |

## Telemetry

| Metric     | Description                 |
| ---------- | --------------------------- |
| Latency    | Request/response time       |
| Errors     | Error rates by endpoint     |
| Throughput | Requests per second         |
| Tracing    | Distributed request tracing |

## Offloading

| Feature        | Description                |
| -------------- | -------------------------- |
| Task Queue     | Background task processing |
| Disk Offload   | /tmp for large data        |
| Reconciliation | Batch processing           |

## Related Epics

- `epic-api-library-distribution.md` — Library packaging
- `epic-security-sandboxing.md` — Security hardening
- `epic-rag-document-processing.md` — Document ingestion API
