<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Embedding and telemetry retention policies

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, retention
**Related:** FEAT-GENERATION-USAGE-ANALYTICS, TASK-admin-llm-execution-analytics-per-model-per-provider-rollups, BUG-repair-telemetry-analytics-ui-contracts

**Summary:** TTL/prune for memory_embeddings + actor_memories (per-world-activity retention + batch-delete job, no orphans after actor/world delete); time-partitioned telemetry_events with scheduled DROP of old partitions + sampling-rate config (telemetry OFF by default, 90-day retention).

**Context:** memory_embeddings is the densest storage (~KB/row) with no TTL; telemetry_events is bounded only by config that has no partition-enforcement mechanism. Policy must precede any scale event.

**Acceptance Criteria:**

- [ ] Embeddings older than configured retention are deleted; no orphans after actor/world deletion.
- [ ] Old telemetry partitions dropped on schedule; sampling rate reduces volume by configured factor.
- [ ] Account/chat deletion propagates to hashed usage telemetry, or a documented retention exception defines the retained rows and purpose.
- [ ] Retained usage rows have an explicit TTL; deletion and retention behavior are covered by tests.
- [ ] `bun run check` green.

**Amendment 2026-11-24 (Open WebUI usage-statistics research C7):** before broad personal analytics, decide whether hashed usage telemetry is retained independently of chats; add account/chat deletion propagation or a documented retention exception; keep content export permission separate from aggregate metrics. First acceptance proof: deleting a user/chat leaves no telemetry rows that policy says must be removed; retained rows have an explicit TTL and documented purpose.
