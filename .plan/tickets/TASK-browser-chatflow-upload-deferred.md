<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-browser-chatflow-upload-deferred: chatState init never reaches loadChats in bundled chat page

**Summary:** chat-flow upload-linkage browser test deferred; underlying product defect needs a bundle-level fix.
**Status:** open
**Priority:** P2
**Type:** Bug
**Tags:** testing, e2e, browser, alpine, bundling
**Epic:** epic-testing-qa

## Symptom

`tests/e2e/flows/browser/chat-flow.browser.ts` "Chat gallery upload linkage" fails
(identically on `dev` and the views worktree): the chat-list item never renders
because the mounted `chatState()` Alpine instance's `init()` exits before
`await this.loadChats()` (`src/frontend/alpine/chat/lifecycle.ts:89`). No
`/api/v1/chats` fetch is ever attempted at page load (verified by a fetch
wrapper via `addInitScript`); calling `loadChats()` manually on the same
instance works and populates the list.

## Suspected root cause

Chat-list code ships in **three** bundles simultaneously:
`alpine-init.js` (1.0MB), `chat-list.js` (502KB), and `pages.js`. The mounted
`chatState` instance has a working `init` (manual invocation runs to completion
without error) but never invokes `loadChats` — consistent with a duplicated
registration/eval order defect across the bundles (the "inline script
migration" the chat-flow suite header defers toggle/visibility tests to).

## Deferred test

`test.skip("chat sidebar upload links the asset to the active chat")` in
chat-flow.browser.ts with a `ponytail:` comment. Un-skip once the chat page
initializes `chatState().init()` through a single canonical bundle and the test
passes unaided.

## Acceptance

- [ ] One canonical bundle owns `chatState` registration + init on `/views/chat`.
- [ ] `init()` reaches `loadChats()`; chats render without manual calls.
- [ ] Deferred test un-skipped and green in `bun run test:e2e:browser`.
