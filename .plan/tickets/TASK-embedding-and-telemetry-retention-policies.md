<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Embedding and telemetry retention policies

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, retention

## Summary

TTL/prune for memory_embeddings + actor_memories (per-world-activity retention + batch-delete job, no orphans after actor/world delete); time-partitioned telemetry_events with scheduled DROP of old partitions + sampling-rate config (telemetry OFF by default, 90-day retention). Acceptance: old embeddings deleted per policy; old telemetry partitions dropped; check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
