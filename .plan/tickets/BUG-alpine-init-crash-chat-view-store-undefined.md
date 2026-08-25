# BUG: Alpine init crashes on chat view — store children/visibility undefined

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Chat view Alpine initialization throws `Uncaught TypeError: Cannot read properties of undefined (reading 'children')` and `Cannot read properties of null (reading 'visibility')` (console, observed in browser e2e 2026-08-25). The crash aborts component init downstream: `#chat-list` never renders (no "No chats yet" empty state, no `a.nav-item` entries) and several chat-view smoke/chat-flow tests fail (`smoke.browser.ts` Chat view cluster, `chat-flow.browser.ts` Toggle buttons/Elements present cluster).

Suspects: a chat store/component reading `$store.<x>.children` / `.visibility` before the store is registered, or an init-order dependency between `alpine-init.js` store registration and component `x-data` evaluation.

## Repro

`E2E_SAFEGUARD=1 bun test --timeout 60000 ./tests/e2e/flows/browser/chat-flow.browser.ts` — watch console errors on chat view load.

## Acceptance Criteria

- [ ] Root cause identified (which store/property is undefined at init)
- [ ] Chat view renders chat list (empty state at minimum) without console errors
- [ ] `chat-flow.browser.ts` "chat list panel has chat template in DOM" (strengthened behavioral assertion) passes
- [ ] smoke chat-view cluster passes
