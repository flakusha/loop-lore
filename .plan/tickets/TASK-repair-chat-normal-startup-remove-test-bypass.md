<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Repair chat normal startup, remove browser test bypass

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

`tests/e2e/flows/browser/chat-send.browser.ts:25-44` documents that the bundled `chatState().init()` never reaches `loadChats()` (`TASK-browser-chatflow-upload-deferred`), so the test selects the chat through Alpine component state via `page.evaluate(...)` instead of using the visible UI. A green send-path test therefore coexists with broken normal chat startup.

## Why

The existing browser chat/Alpine tests also time out waiting for chat list state — the bypass masks the regression in CI rather than fixing the underlying initialization path.

## Where

- src/frontend/alpine/chat-state.ts (or equivalent — bundled chat state)
- tests/e2e/flows/browser/chat-send.browser.ts (lines 25-44)

## Acceptance Criteria

- [ ] Loading `/views/chat` as a normal user populates chat items without `page.evaluate()` component-state injection.
- [ ] The existing send/encryption test passes using the UI-driven path.
- [ ] `selectChatViaAlpine()` helper is removed from chat-send.browser.ts.
- [ ] A page-error assertion covers the normal startup transition.


git issue: 242efba
