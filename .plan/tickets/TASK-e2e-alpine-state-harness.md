<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: E2E Alpine state harness

**Status:** 🟢 Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-e2e-integration-testing

## Summary

getAlpineData + waitForAlpineState helpers reading Alpine.$data / __x.getUnobservedData; migrate htmx-alpine/chat-flow browser tests off presence+sleeps onto component-local reactive state; pin chatState() shape + defaults + ui-store contract (catches undeclared-template-var hydration bugs).

## Implementation Notes

### helpers (already done by previous work)

`tests/e2e/helpers/htmx-alpine.ts` exports:
- `getAlpineData<T>(page, selector)` — reads `__x.getUnobservedData()` / `Alpine.$data(el)`
- `waitForAlpineState<T>(page, selector, predicate, timeoutMs)` — polls Alpine component state

### Contract fixture

`tests/e2e/fixtures/chat-state-contract.ts` (new) exports:
- `ChatStateShape` interface — re-exports `ChatState` from `@/frontend/alpine/chat-types`
- `UiStoreShape` interface — explicit properties mirroring `uiStoreDefinition` keys
- `UI_STORE_DEFAULTS` const — cold-load default mirror of all `uiStoreDefinition` fields
- `CHAT_STATE_DEFAULTS` const — cold-load default mirror of `chatState()` factory scalar fields
- `CHAT_SELECTORS` const — pinned `data-testid` + Alpine `x-data` selectors used by all state-asserting tests

### Migrations

**chat-state.browser.ts** (upgraded):
- Replaced `Record<string, unknown>` with `ChatStateShape` / `UiStoreShape`
- Added third test: cold-load `$store.ui.showChatList === false` at `/views/chat` via `waitForAlpineState`

**htmx-alpine.browser.ts** (migrated):
- 12 state-asserting `waitForTimeout` calls replaced with `waitForAlpineState<UiStoreShape>(...)`
- 8 timing-only `waitForTimeout` calls retained with `// timing:` justification comments (CSS transitions, debounce windows, keyboard event processing)
- `getAlpineStore<UiStoreShape>` typed throughout

**chat-flow.browser.ts** (already migrated — uses `waitForAlpineState`, no `waitForTimeout`)

**chat-send.browser.ts** (already minimal — single `waitForTimeout` retained as timing-only with justification comment)

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
