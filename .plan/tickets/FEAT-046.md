---
title: "FEAT-046: Branch navigation API"
status: open
priority: medium
labels: [feature, chat, api]
epic: epic-conversation-branching
related: [FEAT-045, FEAT-047]
---

# FEAT-046: Branch navigation API

## What

REST API endpoints for listing, navigating, and managing conversation branches — complementing the branching data model (FEAT-045).

## Why

The data model (FEAT-045) provides storage. This ticket provides the API surface for branch operations: listing all branches, getting branch metadata, switching active branch, deleting branches, and merging branches.

## Current State

- No branch API exists — depends on FEAT-045 data model
- `src/routes/chats.ts` — existing chat routes

## Acceptance Criteria

- [ ] **`GET /api/chats/:id/branches`** — list all branches with metadata (name, fork point message, message count, is_active, last_activity)
- [ ] **`GET /api/chats/:id/branches/:branchId`** — branch detail with full message path from root to tip
- [ ] **`POST /api/chats/:id/branches`** — create new branch (alias for fork operation)
- [ ] **`PATCH /api/chats/:id/branches/:branchId`** — rename/activate branch
- [ ] **`DELETE /api/chats/:id/branches/:branchId`** — delete branch (only if not active; must switch first)
- [ ] **`POST /api/chats/:id/branches/:branchId/merge`** — merge branch messages into active branch (append fork-point descendants after current tip)
- [ ] **Pagination** — branch list supports cursor-based pagination
- [ ] Unit tests for all CRUD operations and merge logic

## Implementation Notes

- Route file: `src/routes/chat-branches.ts` (new, <200L)
- Merge: append-only (no conflict resolution) — branch messages become children of active branch tip
- Delete guard: refuse to delete active branch (must PATCH to switch first)
- Authorization: reuse existing `checkChatAccess` middleware
- Size gate: branch route files <250L each

## Dependencies

- Blocked by: FEAT-045 (branching data model)
- Blocks: FEAT-047 (branch UI controls)
