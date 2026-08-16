---
title: "FEAT-075: Memory access audit log"
status: open
priority: medium
labels: [feature, memory, audit]
epic: epic-memory-systems-three-tier
related: [FEAT-059, FEAT-066]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-075: Memory access audit log

## What

An audit trail for memory operations: who pinned what, when memories decayed, which memories were injected into which prompts, and source attribution for memory content.

## Why

Memory is the backbone of long-running roleplay. When something goes wrong — a character "forgets" a key fact, or an unexpected memory appears — users need to trace what happened. The audit log provides transparency: which memories were active, who created/pinned/modified them, and when decay removed them.

## Current State

- `src/frontend/alpine/memory-panel.ts` — CRUD UI for memories with pin/unpin
- `src/memory/` — memory budget, provisioning, purge, decay systems
- `src/assistant/prompt/sections/memories.ts` — memories injected into prompts
- No audit trail exists — memory operations are fire-and-forget

## Acceptance Criteria

- [ ] **`memory_audit_log` table** — records: `memory_id`, `actor_id`, `action` (create/pin/unpin/decay/inject/modify/purge), `details` (JSON), `created_at`
- [ ] **Automatic logging** — memory CRUD operations, pin/unpin, decay events, and prompt injection all write audit entries
- [ ] **`/api/actors/:id/memories/audit`** — returns paginated audit log with optional action filter and date range
- [ ] **Audit panel UI** — memory panel tab showing recent audit entries with action icons, timestamps, and expandable details
- [ ] **Injection tracking** — each prompt assembly records which memories were included (memory_id + reason: pinned/selective/random)
- [ ] **Decay timeline** — visual timeline showing memory lifecycle: created → injected N times → decayed
- [ ] Unit tests for audit logging on each action type

## Implementation Notes

- Migration: `memory_audit_log` table with indexes on `(memory_id, created_at)` and `(actor_id, created_at)`
- Hook into existing memory service methods — add `auditLog(db, memoryId, actorId, action, details)` calls
- Injection tracking: extend `SectionBuilder` return type to include `included_memory_ids`
- API: paginate with cursor (not offset) for performance on large logs
- UI: Alpine component in memory panel, filterable by action type
- Size gate: audit files <250L each

## Dependencies

- Blocked by: nothing
- Blocks: nothing (standalone transparency tool)
