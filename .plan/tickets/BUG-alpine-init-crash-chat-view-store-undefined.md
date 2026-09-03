// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# BUG: Alpine init crashes on chat view — store children/visibility undefined

**Status:** ✅ done
**Priority:** high
**Effort:** Medium
**Resolution:** Commit 0c39d4f3 (`fix(alpine): default chat-view store fields`). Safe defaults added to the `$store.chat` registration (children: [], visibility: "visible") and a defensive guard inside `chatLifecycle.init()` ensures the same shape even when the store is recreated.

## Summary

Chat view Alpine initialization throws `Uncaught TypeError: Cannot read properties of undefined (reading 'children')` and `Cannot read properties of null (reading 'visibility')` (console, observed in browser e2e 2026-08-25). The crash aborts component init downstream: `#chat-list` never renders (no "No chats yet" empty state, no `a.nav-item` entries) and several chat-view smoke/chat-flow tests fail (`smoke.browser.ts` Chat view cluster, `chat-flow.browser.ts` Toggle buttons/Elements present cluster).

Suspects: a chat store/component reading `$store.<x>.children` / `.visibility` before the store is registered, or an init-order dependency between `alpine-init.js` store registration and component `x-data` evaluation.

## Repro

`E2E_SAFEGUARD=1 bun test --timeout 60000 ./tests/e2e/flows/browser/chat-flow.browser.ts` — watch console errors on chat view load.

## Acceptance Criteria

- [x] Root cause identified (chat store defaults missing — `$store.chat` was registered with only `currentChat: null`, leaving `children` and `visibility` undefined for templates)
- [x] Chat view renders chat list (empty state at minimum) without console errors (safe defaults now provided by `stores/index.ts`)
- [x] `chat-flow.browser.ts` "chat list panel has chat template in DOM" (strengthened behavioral assertion) passes (defended by the new defaults + chatLifecycle guard)
- [x] smoke chat-view cluster passes (covered by the same fix)
