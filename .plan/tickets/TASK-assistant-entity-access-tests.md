<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Access Unit Tests

**Status:** 📝 Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, tests, unit, entity-access
**Related:** `epic-assistant-entity-access.md`

## Summary

Unit tests for all assistant entity-access command handlers, the adapter layer, the adaptation engine, and the quota enforcement. Tests cover happy paths, error cases, access guard enforcement, and quality gate interactions.

## Motivation

Every command handler, adapter, and the adaptation engine must have unit tests covering:
- Happy path (successful operation)
- Error cases (not found, access denied, quota exceeded)
- Access guard enforcement
- Quality gate interactions
- Duplication and adaptation edge cases

## Test Structure

### Command Handler Tests

| Test File | Covers |
|---|---|
| `src/assistant/commands/rag.test.ts` | `/rag-search`, `/rag-ask`, `/rag-preview`, `/rag-decompose` |
| `src/assistant/commands/assets.test.ts` | `/asset-list`, `/asset-preview`, `/asset-search`, `/asset-link` |
| `src/assistant/commands/worlds.test.ts` | `/world-list`, `/world-get`, `/world-update`, `/world-delete` |
| `src/assistant/commands/locations.test.ts` | `/loc-list`, `/loc-get`, `/loc-update` |
| `src/assistant/commands/characters.test.ts` | `/char-list`, `/char-get`, `/char-update`, `/char-adapt` |
| `src/assistant/commands/items.test.ts` | `/item-list`, `/item-get`, `/item-update`, `/inventory`, `/item-transfer`, `/item-drop`, `/item-pickup` |
| `src/assistant/commands/modify.test.ts` | `/modify`, `/apply`, `/import`, `/add`, `/clone` |
| `src/assistant/commands/duplicate.test.ts` | `/duplicate` |
| `src/assistant/commands/adapt.test.ts` | `/adapt` |

### Adapter Tests

| Test File | Covers |
|---|---|
| `src/assistant/adapter/entity.test.ts` | EntityAccessor interface, per-kind implementations |
| `src/assistant/adapter/access.test.ts` | Access guard composition |
| `src/assistant/adapter/duplicate.test.ts` | Duplication logic |
| `src/assistant/adapter/adapt.test.ts` | Adaptation engine |
| `src/assistant/adapter/worlds.test.ts` | WorldAdapter |
| `src/assistant/adapter/items.test.ts` | ItemAdapter |
| `src/assistant/adapter/rag.test.ts` | RagAdapter |
| `src/assistant/adapter/assets.test.ts` | AssetAdapter |

### Quota Tests

| Test File | Covers |
|---|---|
| `src/assistant/quota/engine.test.ts` | Quota enforcement, `QuotaExceededError` |
| `src/assistant/quota/storage.test.ts` | Quota storage, deduction, reset |

### Quality Gate Tests

| Test File | Covers |
|---|---|
| `src/assistant/quality/adaptation.test.ts` | Adaptation-specific quality gates |

## Test Patterns

- Use `bun:test` with `describe`/`it`/`expect`
- Mock the database with `Kysely` test helpers
- Mock LLM calls with fixed responses
- Test access guards by varying `userId` and `role`
- Test quota enforcement by setting remaining quota
- All tests must be deterministic and isolated

## Tasks

- [ ] Write command handler tests (all commands)
- [ ] Write adapter tests (all adapters)
- [ ] Write quota engine tests
- [ ] Write adaptation engine tests
- [ ] Write quality gate tests
- [ ] Ensure `bun run test:unit` passes

## Acceptance Criteria

- [ ] All command handlers have unit tests
- [ ] All adapters have unit tests
- [ ] Quota engine has unit tests
- [ ] Adaptation engine has unit tests
- [ ] `bun run test:unit` passes with new tests
- [ ] Test coverage for entity-access commands meets project standards

## Files

- All `*.test.ts` files alongside their source files
- Test fixtures in `test-utils/` (existing)

## Dependencies

- All implementation tickets must be complete first
- `src/assistant/quality/entity-creation.ts` — Existing quality gate tests as reference
