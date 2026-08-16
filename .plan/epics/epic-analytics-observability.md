<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Analytics & Observability

**Status:** 📝 Draft
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** analytics, observability, telemetry, dashboard, metrics

## Overview

Conversation analytics and observability dashboard. Covers per-chat cost tracking, model comparison, and memory visualization.

## Reference

- Future features plan: `.plan/future-features-plan.md` (Tier 2)

## Features

| Feature                | ID           | Effort | Description                                     |
| ---------------------- | ------------ | ------ | ----------------------------------------------- |
| Conversation analytics | FEA-2026-056 | Low    | Per-chat cost + quality dashboard               |
| Model comparison       | FEA-2026-057 | Low    | A/B agent/model quality via `model_comparisons` |
| Memory visualizer      | FEA-2026-058 | Med    | Knowledge graph over `asset_links`              |

## Acceptance Criteria

- [ ] Per-chat cost + quality dashboard functional
- [ ] Model comparison A/B testing works
- [ ] Memory visualizer displays knowledge graph

## Dependencies

- `model_comparisons` table (existing)
- `asset_links` table (existing)

## Wiring status (verified 2026-08-04)

Routes are **mounted and tested** — the "unwired" assessment is stale:

- `analyticsRoutes` mounted at `src/elysia-app.ts:200` (`app.use(analyticsRoutes({ database }))`)
- `modelComparisonsRoutes` mounted at `src/elysia-app.ts:201`
- Route test: `src/routes/analytics.test.ts`

Open work is feature-level (dashboard UI, memory visualizer), not route wiring.
