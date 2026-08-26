<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# API Governance — Epic

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High (split into 5 sub-epics)
**Type:** Infrastructure Epic
**Tags:** openapi, validation, rate-limiting, telemetry, offloading

## Overview

OpenAPI specification, request validation, rate limiting, telemetry, and resource offloading for production-ready API management.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 5 sub-epics. Each sub-epic delivers independently shippable value; this file remains the hub for the shared layout, contracts, and sequencing.

## Sub-Epics

| Sub-Epic                    | Epic File                              | Scope                                                                                                   | Priority |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| **OpenAPI Specification**   | `epic-api-openapi.md`                  | Generator from Elysia routes, spec lint, breaking-change diff, Swagger UI, versioning/changelog         | High     |
| **Validation & Guardrails** | `epic-api-validation-guardrails.md`    | TypeBox schemas, body/query/path/header validation, sanitization, prompt-injection defense, dashboard   | High     |
| **Rate Limiting**           | `epic-api-rate-limiting.md`            | Sliding window / token bucket, Redis/SQLite store, tiered limits, burst handling                        | High     |
| **Telemetry**               | `epic-api-telemetry.md`                | Metrics collector, latency/error monitoring, distributed tracing, Prometheus export                     | High     |
| **Task Offloading**         | `epic-api-task-offloading.md`          | Task queue, background worker, disk offload (/tmp), batch reconciliation, task status API               | High     |

## Slicing Rationale & Sequencing

1. **OpenAPI Specification** — first slice: the generated spec feeds everything else.
2. **Validation & Guardrails** — builds on the spec surface; the gate all other slices sit behind.
3. After guardrails land, **Rate Limiting**, **Telemetry**, and **Task Offloading** are mutually independent and can proceed in any order or in parallel.

## Motivation

Production APIs need:

- Clear API specification (OpenAPI)
- Request validation and guardrails
- Rate limiting to prevent abuse
- Telemetry for monitoring
- Resource offloading for long-running tasks

## Architecture (shared)

```
src/api-governance/
├── index.ts                  # API Governance main entry
├── openapi/                  # OpenAPI specification      → epic-api-openapi.md
│   ├── generator.ts          # OpenAPI generator
│   ├── validator.ts          # Spec validator
│   ├── diff.ts               # Spec diff
│   └── docs.ts               # Documentation UI
├── validation/               # Request validation         → epic-api-validation-guardrails.md
│   ├── schema.ts             # Schema definitions
│   ├── validator.ts          # Request validator
│   ├── sanitizer.ts          # Input sanitizer
│   └── guardrails.ts         # AI guardrails
├── rate-limiting/            # Rate limiting              → epic-api-rate-limiting.md
│   ├── limiter.ts            # Rate limiter
│   ├── algorithms.ts         # Sliding window, token bucket
│   ├── store.ts              # Rate limit store
│   └── policies.ts           # Rate limit policies
├── telemetry/                # API telemetry              → epic-api-telemetry.md
│   ├── collector.ts          # Telemetry collector
│   ├── metrics.ts            # Metrics (latency, errors, throughput)
│   ├── tracing.ts            # Distributed tracing
│   └── dashboards.ts         # Monitoring dashboards
├── offloading/               # Resource offloading        → epic-api-task-offloading.md
│   ├── offloader.ts          # Task offloader
│   ├── queue.ts              # Task queue
│   ├── worker.ts             # Background worker
│   ├── disk.ts               # Disk offload (/tmp, mktemp)
│   └── reconciliation.ts     # Batch reconciliation
└── api/                      # REST API                   → shared across sub-epics
    ├── governance.ts         # Governance API
    └── metrics.ts            # Metrics API
```

Per-subsystem interfaces, code contracts, and task lists live in the linked
sub-epic files above.

## API Endpoints (shared)

| Method | Path                     | Description        | Owner (sub-epic)      |
| ------ | ------------------------ | ------------------ | --------------------- |
| GET    | `/api/openapi.json`      | OpenAPI spec       | OpenAPI Specification |
| GET    | `/api/docs`              | Swagger UI         | OpenAPI Specification |
| GET    | `/api/metrics`           | Prometheus metrics | Telemetry             |
| GET    | `/api/rate-limit/status` | Rate limit status  | Rate Limiting         |
| GET    | `/api/tasks`             | List tasks         | Task Offloading       |
| GET    | `/api/tasks/:id`         | Task status        | Task Offloading       |
| POST   | `/api/tasks/:id/cancel`  | Cancel task        | Task Offloading       |

## Security Considerations

- Rate limiting prevents abuse
- Input validation prevents injection
- Guardrails protect against prompt injection
- Telemetry enables anomaly detection
- Disk offload prevents memory exhaustion

## Performance Considerations

- Rate limiting: Redis for high-throughput
- Telemetry: Async collection, batch export
- Offloading: Background workers, non-blocking
- Reconciliation: Batch processing, configurable

## Related Epics

- `epic-api-library-distribution.md` — API for library consumers
- `epic-security-sandboxing.md` — Security hardening
- `epic-encryption-foundation.md` — API encryption
- `epic-rag-document-processing.md` — Document ingestion API

## Notes

- OpenAPI spec auto-generated from Elysia routes
- TypeBox provides runtime validation
- Rate limiting supports multiple algorithms
- Telemetry integrates with Prometheus/Grafana
- Offloading handles long-running tasks gracefully
