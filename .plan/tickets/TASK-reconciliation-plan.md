<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Backend Logic Reconciliation Plan

**Status:** 🟡 In Progress — analysis complete; execution split into 4 child tickets
**Priority:** High
**Effort:** Large
**Epic:** epic-logic-reconciliation

## Summary

Comprehensive analysis of backend code state: logic correctness, wiring integrity, and test coverage. Identifies critical gaps where implemented features are never called, security holes, and duplicate logic. This ticket is now the umbrella + findings record; execution lives in child tickets.

## Child Tickets

| Ticket                        | Scope                                                        | Order |
| ----------------------------- | ------------------------------------------------------------ | ----- |
| `TASK-recon-critical-fixes.md`      | Phase 1: wire GM service, memory injection, pruning, transitions; fix turn double-count | 1st |
| `TASK-recon-security-fixes.md`      | Phase 2: ownership checks, reaction access, SSRF, startup race | 2nd |
| `TASK-recon-test-coverage.md`       | Phase 3: chat/auth/route/telemetry/image-edit/services tests | 3rd (overlaps) |
| `TASK-recon-dedup.md`               | Phase 4: consolidate duplicated service logic (+ Phase 5 backlog) | 4th |

## Analysis Results (shared findings)

### 1. Test Coverage

- **1575 tests, all passing** (good baseline)
- **1216 source files, 107 test files (8.8% file-level coverage)**
- Routes: 33 of 47 route files have tests (70%)
- Routes WITHOUT tests (13): `activity-stream`, `admin-character-overrides`, `character-availability`, `character-avatars`, `character-emotions`, `character-io`, `character-licensing`, `character-mood`, `character-relationships`, `character-traits`, `chat-context`, `export`, `i18n`, `import`, `message-reactions`
- Backend dirs with 0 tests: `src/chat` (15 files), `src/auth` (2 files), `src/telemetry` (3 files), `src/image-edit` (4 files), `src/services` (2 files)

### 2. Critical Logic Issues

#### A. Unwired Orchestration (CRITICAL — highest priority)

Modules fully implemented and tested but **never imported outside their own test files** — full table in `TASK-recon-critical-fixes.md`. Impact: story mode (GM orchestration), context pruning, memory injection, auto-renaming, hallucination detection, and moderation are all implemented but inactive.

#### B. Turn Number Double-Count Bug

- `TurnManager.selectNextActor()` increments `currentTurn` BEFORE selecting the actor
- `GameMasterService.executeTurn()` uses `this.turnManager.currentTurn + 1` for turnNumber
- Result: turn numbers are off by one (0→1 via selectNextActor, then 1+1=2 via executeTurn)

#### C. Duplicate Logic

- `routes/messages.ts` has its own `assertChatAccess()` and `requireMessageAccess()` — duplicates `chat/service.ts`
- `routes/messages.ts` has its own message listing + variant logic — duplicates `listMessages()` / `getMessageVariants()`
- `routes/chat-context.ts` has its own context window logic — duplicates `getChatContext()`

### 3. Security Issues

Full table in `TASK-recon-security-fixes.md`. Headlines: no ownership check on 7 character route files (High); reaction DELETE without message access check (Medium); SSRF in import-from-URL (Medium); server starts before migrations (Medium).

### 4. Wiring Analysis — Actual Generation Pipeline

Current flow (what IS wired):

1. User posts message → `routes/messages.ts` → `triggerAutoGeneration()`
2. `triggerAutoGeneration()` → resolves provider → `PromptAssembler.assemble()` → calls LLM
3. Group chat: `selectNextGroupActor()` → `TurnManager.selectNextActor()` → cascade
4. Story mode: falls through to same `triggerAutoGeneration()` — **GameMasterService NOT used**
5. Memory extraction: `extractAndStoreMemories()` — ✅ wired correctly
6. Everything else: ❌ not wired

## Notes

- Ignore frontend wirings for now
- Create new tickets at low priority for items not addressed in this plan
- Follow common sense: functionality and features > docs and .plan
- Value priority: chat/memories/characters/assistant/nsfw > moderation/access/gallery/i18n > e2e tests/epics/eslint
