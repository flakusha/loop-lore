<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Embedding and telemetry retention policies

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, retention

**Summary:** TTL/prune for memory_embeddings + actor_memories (per-world-activity retention + batch-delete job, no orphans after actor/world delete); time-partitioned telemetry_events with scheduled DROP of old partitions + sampling-rate config (telemetry OFF by default, 90-day retention).

**Context:** memory_embeddings is the densest storage (~KB/row) with no TTL; telemetry_events is bounded only by config that has no partition-enforcement mechanism. Policy must precede any scale event.

**Acceptance Criteria:**

- [ ] Embeddings older than configured retention are deleted; no orphans after actor/world deletion.
- [ ] Old telemetry partitions dropped on schedule; sampling rate reduces volume by configured factor.
- [ ] `bun run check` green.
