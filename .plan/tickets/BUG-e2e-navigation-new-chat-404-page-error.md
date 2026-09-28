<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Navigation e2e "creates new chat" fails on an unhandled 404 page error

**Summary:** The `navigation.browser.ts` case "creates new chat and redirects to chat page" fails the `e2e - browser (baseline)` gate. Every assertion passes, but a `console.error: Failed to load resource: 404` is recorded and `errors.assert()` in the `finally` block throws.
**Context:** `trackPageErrors` captures the message but not the failing URL, so the 404 is unattributed. The test also invokes `loadNewChatPage?.()` manually because `page.goto()` bypasses `htmx:load`, so the request may be a harness artifact rather than a real user-facing defect.
**Acceptance Criteria:** The failing request is identified by URL; either the resource is served or the harness-induced request is excluded; the browser baseline gate passes with all 34 files green.

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Type:** Bug
**Tags:** e2e, testing, browser, tooling

## Summary

`tests/e2e/flows/browser/navigation.browser.ts` — the "New Chat navigation >
creates new chat and redirects to chat page" case fails in the `e2e - browser
(baseline)` gate. The assertions all pass (the chat is created and the URL
becomes `/views/chat`), but the `finally` block calls `errors.assert()`, and one
`console.error: Failed to load resource: the server responded with a status of
404 (Not Found)` was recorded during the run, so the test throws.

## Evidence

Run on a clean `dev` checkout:

```
$ bun test ./tests/e2e/flows/browser/navigation.browser.ts
error: Page errors detected (1):
console.error: Failed to load resource: the server responded with a status of 404 (Not Found)
  at assert (tests/e2e/helpers/htmx-alpine.ts:60:19)
  at <anonymous> (tests/e2e/flows/browser/navigation.browser.ts:196:16)
(fail) Navigation E2E > New Chat navigation > creates new chat and redirects to chat page
 12 pass
 1 fail
```

## Notes

The 404 is not identified by the harness — `trackPageErrors` records the
message but not the failing URL, so the first step of the fix is to log
`request.url()` for non-2xx responses in `tests/e2e/helpers/htmx-alpine.ts`.
Likely candidates on that page: a missing static asset under `src/public/`, or
an htmx partial that the new-chat view requests after redirect.

Note the test also calls `loadNewChatPage?.()` manually because `page.goto()`
bypasses the `htmx:load` event, so this path is partially synthetic; the 404 may
be an artifact of that bypass rather than a real user-facing bug. Determine that
before treating it as a product defect.

## Acceptance Criteria

- [ ] The failing request is identified (URL logged by the helper)
- [ ] Either the missing resource is provided, or the test correctly excludes a
      harness-induced request
- [ ] `bun run scripts/check-parallel.mjs --gates 'e2e - browser (baseline)'` passes
- [ ] All other 33 browser files stay green

## Notes on provenance

Found while landing `024_memory_embeddings_cascade_fk`. Unrelated to that change
— the failure is baseline on `dev`.


git issue: b99af61
