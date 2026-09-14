<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: tui/app.ts never threads a session token into ChatWidget — auth header never sent

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** small

## Summary

`src/tui/chat/index.ts:34` declares `ChatWidget.sessionToken: string | undefined`; `ChatWidgetOptions.sessionToken?` is the constructor hook (`src/tui/chat/types.ts:16`). `ChatWidget.handleSend` and `ChatWidget.loadMessages` both forward `host.sessionToken` to the request layer. But `src/tui/app.ts:49-55` constructs `new ChatWidget(this.screen, { onChatChange: ... })` with **no `sessionToken` field**. Result: every TUI request goes out without `Authorization: Bearer <token>`, so authenticated chat routes (`/api/chats/:id/messages`) reject as 401 in non-solo deployments.

`src/tui/chat/index.ts:125-127` also exposes `setSessionToken(token: string)`, but no caller invokes it.

There is no existing env-var convention for the TUI session token — frontend reads from `localStorage.session_token` (`src/frontend/fe-fetch.ts:41`, `src/frontend/alpine/transports/server.ts:40`). Need to pick a TUI source (env var, config flag, prompt-on-startup) before fixing.

## Acceptance Criteria

- [ ] Session token sourced at TUI startup. Options (user decision required):
  - env var `LOOP_LORE_SESSION_TOKEN` (no existing convention)
  - config flag under `[tui]` (`sessionToken` or `sessionTokenFromEnv`)
  - runtime prompt at startup
- [ ] Token threaded into `ChatWidget` constructor (or via `setSessionToken` post-construction).
- [ ] Verified: outgoing `/api/chats/:id/messages` requests carry `Authorization: Bearer <token>` when token is set.
- [ ] Verified: requests without token omit the header (anonymous mode still works against solo deployments).

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): requires design decision on token source + untestable `app.ts` edit.
- Workaround for now: in solo mode, server ignores missing token → TUI works for development; broken for remote/multi-user.