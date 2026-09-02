<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Entity Access E2E Tests

**Status:** 📝 Not Started
**Priority:** High
**Effort:** High
**Type:** Task
**Tags:** assistant, tests, e2e, entity-access
**Related:** `epic-assistant-entity-access.md`

## Summary

End-to-end tests for the full assistant entity-access command flow: chat → command → response. Covers RAG search, asset browsing, world/location/character/item management, duplication, and adaptation through the chat interface.

## Motivation

Unit tests verify individual handlers and adapters. E2E tests verify the full flow: the user sends a command in chat, the assistant processes it, and the response is correct — including frontend rendering of command results.

## Test Scenarios

### RAG Access E2E

| Scenario | Steps | Expected |
|---|---|---|
| RAG search | Send `/rag-search magic items` | Ranked document summaries returned |
| RAG ask | Send `/rag-ask What is the capital?` | LLM answer with citations |
| Asset search | Send `/asset-search dragon` | Ranked asset results |

### World & Location E2E

| Scenario | Steps | Expected |
|---|---|---|
| World list | Send `/world-list` | Paginated world list |
| World get | Send `/world-get world-001` | World details rendered |
| World update | Send `/world-update world-001 lore=New lore` | Confirmation → updated lore |
| Location get | Send `/loc-get loc-001` | Location details rendered |

### Character & Item E2E

| Scenario | Steps | Expected |
|---|---|---|
| Character list | Send `/char-list` | Character list rendered |
| Character get | Send `/char-get char-001` | Character card rendered |
| Character adapt | Send `/adapt char-001 --to world-cyberpunk --fields outfit` | Adaptation preview → confirmation → adapted character |
| Inventory | Send `/inventory char-001` | Item list rendered |
| Item transfer | Send `/item-transfer item-inst-001 char-002` | Item transferred |

### Duplication & Adaptation E2E

| Scenario | Steps | Expected |
|---|---|---|
| Duplicate | Send `/duplicate character char-001 --as "Aria II"` | New character created |
| Adapt | Send `/adapt item item-001 --to world-medieval` | Adaptation preview → confirmation → adapted item |

### Quota E2E

| Scenario | Steps | Expected |
|---|---|---|
| Quota exceeded | Exhaust quota, then send `/rag-search` | `QuotaExceededError` message |

### Access Guard E2E

| Scenario | Steps | Expected |
|---|---|---|
| Access denied | User A tries `/world-get world-owned-by-B` | Access denied message |

## Test Infrastructure

- Use Playwright for browser-based E2E tests
- Use existing `tests/e2e/` infrastructure
- Test against running server (`bun run dev`)
- Each scenario is a separate test case
- Tests use existing test fixtures and user accounts

## Tasks

- [ ] Write RAG access E2E tests
- [ ] Write world/location E2E tests
- [ ] Write character/item/inventory E2E tests
- [ ] Write duplication E2E tests
- [ ] Write adaptation E2E tests
- [ ] Write quota E2E tests
- [ ] Write access guard E2E tests
- [ ] Ensure `E2E_SAFEGUARD=1 bun test tests/e2e/` passes

## Acceptance Criteria

- [ ] All command flows work end-to-end
- [ ] Quota enforcement blocks operations in E2E
- [ ] Access guards enforce ownership in E2E
- [ ] `E2E_SAFEGUARD=1 bun test tests/e2e/` passes

## Files

- `tests/e2e/assistant-entity-access.spec.ts` — E2E test suite

## Dependencies

- All implementation and unit test tickets must be complete first
- Running server for E2E tests
