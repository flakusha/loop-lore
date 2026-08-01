# BUG: Alpine init hydration errors abort chat subtree rendering

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Bug
**Tags:** frontend, alpine, bug, hydration, chat
**Epic:** epic-testing-qa.md

## Summary

On `/views/chat`, Alpine throws multiple uncaught errors during tree-processing, which abort hydration of the `#chat-list` `x-if`/`x-for`. Component state is correct (`chats=1`, `filteredChats=1`) but no `.nav-item` ever renders — breaking `Chat list selection` in `htmx-alpine.browser.ts` (13 pass / 4 fail current baseline).

## Symptoms (live browser console)

```text
TypeError: Object.defineProperty called on non-object   (x12+)
TypeError: o.get is not a function
ReferenceError: showGmPanel is not defined
ReferenceError: _searchResults is not defined
ReferenceError: _moodPanel is not defined
```

## Root Cause

- Template expressions reference variables **never declared in component state**: `showGmPanel`, `_searchResults`, `_moodPanel`, `activeTab`, `gmPanel`.
- `Object.defineProperty called on non-object` / `o.get is not a function`: Alpine trying to make a reactive property on a non-object (likely a getter/`this` context issue or an `undefined` value wrapped in a reactive store).

The thrown exception breaks Alpine's walk of that branch, so downstream `x-if`/`x-for` (chat list) never hydrates.

## Acceptance Criteria

- [ ] No `pageerror` / `console.error` on `/views/chat` load (verify with browser probe)
- [ ] `#chat-list` hydrates rendered `.nav-item` entries for seeded chats
- [ ] `htmx-alpine.browser.ts` `Chat list selection` + `Chat window modals open` pass
- [ ] Full browser suite green: `for f in tests/e2e/flows/browser/*.browser.ts; do bun test --max-concurrency=1 "./$f" || exit 1; done`

## Files

- `src/frontend/alpine/chat.ts` + sub-modules (`chat-panels`, `mood`, …) — declare missing state or fix template refs
- `src/components/chat/chat-list-panel.html` — any template vars referencing undeclared state
- Template files referencing `showGmPanel`/`_searchResults`/`_moodPanel`/`activeTab`

## Notes

Will be caught permanently once TASK-browser-console-assert (fail on pageerror/console.error) lands.
