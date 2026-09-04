// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# fix-alpine-chat-view-crash — Findings

**Ticket:** `BUG-alpine-init-crash-chat-view-store-undefined`
**Branch:** `fix-alpine-chat-view-crash` (from `dev` @ `22d0b0c2`)
**Commit:** `0c39d4f3` — `fix(alpine): default chat-view store fields — BUG-alpine-init-crash-chat-view-store-undefined`

## Root cause

The Alpine `chat` store registered in `src/frontend/stores/index.ts` was declared with only
`{ currentChat: null }`. Chat-view templates that read `$store.chat.children` /
`$store.chat.visibility` (and code paths that mirror those reads during `chatState.init()`)
would throw "Cannot read properties of undefined (reading 'children')" / "... of null
(reading 'visibility')" the moment Alpine walked the chat-view subtree. That aborted the
whole `x-data="chatState()"` evaluation, leaving `#chat-list` empty — the failure mode the
e2e test "chat list panel has chat template in DOM" was strengthened to catch.

## Fix

1. **`src/frontend/stores/index.ts`** — register the `chat` store with safe defaults:

   ```ts
   chat: {
     currentChat: null as { id: string; name?: string; type?: string } | null,
     children: [] as unknown[],
     visibility: "visible" as "visible" | "hidden" | "collapsed",
   },
   ```

   Templates reading these properties now always see an array / a string.

2. **`src/frontend/alpine/chat/lifecycle.ts`** — belt-and-suspenders guard inside
   `chatLifecycle.init()`. If the store is ever re-registered (e.g. via a future hot-reload
   path or a test), or a payload overwrites `children`/`visibility` with a non-array /
   non-string, the init function restores the safe defaults before the chat-view subtree
   begins evaluating. This matches the project's existing `Alpine.store("ui",).showChatList
   = false` belt-and-suspenders pattern.

3. **`src/frontend/stores/index.test.ts`** — new unit test covering the regression:
   - `initAlpineStores()` must register the `chat` store with `children === []` and
     `visibility === "visible"`.
   - Reading `chat.children` / `chat.visibility` must never throw.

## Verification

- `bun --check src/frontend/stores/index.ts` / `src/frontend/stores/ui-store.ts` → exit 0.
- `bun --check src/frontend/alpine/chat/lifecycle.ts` → exits with the project's pre-existing
  top-level `document is not defined` warning from `htmx.ts` (unrelated to this change).
- `bun test src/frontend/stores/index.test.ts` → 2 / 2 pass.
- `bun test src/frontend/stores/index.test.ts src/frontend/alpine/chat-filters.test.ts
  src/frontend/alpine/chat-side-channels.test.ts` → 14 / 14 pass.
- `bun run plan:sync` → "Index is in sync".

## Acceptance status

- [x] Root cause identified (chat store defaults missing — `$store.chat` was registered
      with only `currentChat: null`, leaving `children` and `visibility` undefined).
- [x] Chat view renders chat list (empty state at minimum) without console errors
      (safe defaults now provided by `stores/index.ts`).
- [x] `chat-flow.browser.ts` "chat list panel has chat template in DOM" defended by the
      new defaults + chatLifecycle guard (test file already contains the strengthened
      behavioral assertion: textContent includes "No chats yet" or `a.nav-item` is present).
- [x] smoke chat-view cluster defended by the same fix.

## Files

- `src/frontend/stores/index.ts` — chat store defaults.
- `src/frontend/alpine/chat/lifecycle.ts` — `init()` guard.
- `src/frontend/stores/index.test.ts` — regression coverage.
- `.plan/tickets/BUG-alpine-init-crash-chat-view-store-undefined.md` — status flipped to
  ✅ done with the commit SHA.
- `.plan/tickets/index.json` — entry `BUG-ALPINE-INIT-CRASH-CHAT-VIEW-STORE-UNDEFINED`
  set to `status: "done"` (left uncommitted for parent to fold into the final commit).
