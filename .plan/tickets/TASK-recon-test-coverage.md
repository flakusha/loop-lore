<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-recon-test-coverage: Backend reconciliation — Phase 3 test coverage

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** TASK
**Tags:** backend, testing
**Epic:** epic-logic-reconciliation
**Parent:** TASK-reconciliation-plan (umbrella)

## Summary

Close the file-level test-coverage gaps found by the audit: 15 untested chat-module files, 2 auth files, 13 untested route files, plus telemetry, image-edit and services modules.

## Context

Baseline at audit time: 1575 tests passing; 1216 source files, 107 test files (8.8% file-level coverage). Routes: 33 of 47 route files have tests (70%). Backend dirs with 0 tests: `src/chat` (15 files), `src/auth` (2 files), `src/telemetry` (3 files), `src/image-edit` (4 files), `src/services` (2 files).

Routes WITHOUT tests (13): `activity-stream`, `admin-character-overrides`, `character-availability`, `character-avatars`, `character-emotions`, `character-io`, `character-licensing`, `character-mood`, `character-relationships`, `character-traits`, `chat-context`, `export`, `i18n`, `import`, `message-reactions`.

Value priority: chat/memories/characters/assistant/nsfw > moderation/access/gallery/i18n > e2e tests/epics/eslint.

## Tasks

#### 3.1 Chat module tests (15 files, 0 tests)

- `src/chat/service.ts` — core CRUD, access checks
- `src/chat/context-window.ts` — token computation, thresholds
- `src/chat/memory-injection.ts` — injection logic
- `src/chat/memory-promotion.ts` — promotion pipeline
- `src/chat/pruning.ts` — scoring, pruning algorithm
- `src/chat/transitions.ts` — transition detection
- `src/chat/auto-rename.ts` — rule-based and LLM-based renaming
- `src/chat/moderation.ts` — permission checks
- `src/chat/hallucination-guard.ts` — entity detection
- `src/chat/response-length.ts` — preset resolution
- `src/chat/token-counter.ts` — token counting
- `src/chat/token-utils.ts` — token estimation
- `src/chat/random-events.ts` — random event generation

#### 3.2 Auth module tests (2 files, 0 tests)

- `src/auth/jwt.ts` — JWT sign/verify
- `src/auth/index.ts` — auth entry point

#### 3.3 Route tests for untested routes (13+ files)

- `message-reactions.ts` — toggle, group, max reactions
- `chat-context.ts` — context state, regenerate
- `export.ts` — ZIP export, character/chat export
- `import.ts` — character card import
- `i18n.ts` — locale listing, user locale update
- `character-availability.ts` — upsert, delete
- `character-avatars.ts` — CRUD, selection
- `character-emotions.ts` — CRUD, emotion definitions
- `character-io.ts` — export/import character systems
- `character-licensing.ts` — upsert, delete
- `character-mood.ts` — CRUD, events
- `character-relationships.ts` — CRUD, events
- `character-traits.ts` — permanent/world/location traits
- `admin-character-overrides.ts` — admin overrides
- (`activity-stream.ts` also listed in the audit's no-test set)

#### 3.4 Telemetry + image-edit module tests

- `src/telemetry/` (3 files) — event recording, cleanup
- `src/image-edit/` (4 files) — image editing pipeline

#### 3.5 Services module tests

- `src/services/` (2 files) — server external manager

## Dependencies

- Parent hub: `TASK-reconciliation-plan.md`
- Siblings: coordinate with TASK-recon-critical-fixes (wiring changes the behavior these tests assert) and TASK-recon-security-fixes (ownership checks change expected status codes in character route tests).
