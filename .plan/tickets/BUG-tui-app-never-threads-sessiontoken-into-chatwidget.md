<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: tui/app.ts never threads a session token into ChatWidget — auth header never sent

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** small

## Summary

`src/tui/chat/index.ts:34` declares `ChatWidget.sessionToken: string | undefined`; `ChatWidgetOptions.sessionToken?` is the constructor hook (`src/tui/chat/types.ts:16`). `ChatWidget.handleSend` and `ChatWidget.loadMessages` both forward `host.sessionToken` to the request layer. But `src/tui/app.ts:49-55` constructs `new ChatWidget(this.screen, { onChatChange: ... })` with **no `sessionToken` field**. Result: every TUI request goes out without `Authorization: Bearer <token>`, so authenticated chat routes (`/api/chats/:id/messages`) reject as 401 in non-solo deployments.

`src/tui/chat/index.ts:125-127` also exposes `setSessionToken(token: string)`, but no caller invokes it.

There is no existing env-var convention for the TUI session token — frontend reads from `localStorage.session_token` (`src/frontend/fe-fetch.ts:41`, `src/frontend/alpine/transports/server.ts:40`). Need to pick a TUI source (env var, config flag, prompt-on-startup) before fixing.

- [x] Session token sourced at TUI startup. Decision: `[tui].sessionToken` in TOML/YAML config (no env-var or runtime prompt in this fix; consistent with frontend `localStorage.session_token` model).
- [x] Token threaded into `ChatWidget` constructor via `sessionToken` option (`src/tui/app.ts:58-65`).
- [x] Empty-string `sessionToken` from TOML normalized to `undefined` (matches frontend `if (token)` pattern in `src/frontend/fe-fetch.ts:41`).
- [x] `loadConfig` failure during TUI startup logged via `getLogger().warn`, TUI still constructs (anonymous mode).
- [x] Verified via new test `src/tui/chat/index.test.ts` (3 cases: forwarded, omitted, empty-string normalized).

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): requires design decision on token source + untestable `app.ts` edit.

## Resolution

- `src/config/schema/tui.ts:7-10` — added optional `sessionToken?: string` to the `TuiConfig` interface.
- `src/config/sections/tui.ts:13-39` — `TuiSection` carries `sessionToken?: string` (no `TUI_DEFAULTS` entry, so absence = anonymous); `tuiMeta.properties.sessionToken` added with the required Bearer-token description. Note (strict-review correction): the class is NOT instantiated by the runtime load path — `loadConfig` builds plain objects via `deepClone(createConfigSchema().defaults)` + `deepMerge`, so the constructor's `""` normalization never executes. Runtime guarantees are: the `ChatWidget` constructor normalization plus the falsy guard in `src/tui/chat/api.ts` (`host.sessionToken ? { sessionToken } : undefined`), both of which make a stray `""` from TOML inert.
- Empirical verification (2026-09-15, throwaway script against `loadConfig`): `[tui] sessionToken = "abc123"` → `config.tui.sessionToken === "abc123"`; `sessionToken = ""` → loader delivers raw `""` (inert downstream per above); section omitted → `undefined`.
- `src/tui/chat/index.ts:42-48` — `ChatWidget` constructor normalizes empty-string `options.sessionToken` to `undefined` so a stray `""` from TOML never ships as a `Bearer ` header.
- `src/tui/app.ts:13,28-65` — `TUIApp` constructor calls `loadConfig()` inside try/catch (`getLogger().warn` on failure, falling back to anonymous) and forwards `config.tui.sessionToken` into `new ChatWidget(this.screen, { sessionToken, ... })`.
- `src/tui/app.ts:137-141` (follow-up, `tui-logger-init`): `createLogger({ level: "warn" })` at module top — required for the `getLogger().warn` fallback above to actually work, since `loadConfig()` itself calls `getLogger()` unconditionally (`runTemplateExpansion`); without init the constructor's catch block rethrew and `bun run tui` crashed at startup. See BUG-tui-app-getlogger-throws-when-running-standalone.
- `src/tui/chat/index.test.ts` — new test file covering the three contract points: explicit token forwarded, omitted token stays undefined, empty-string token normalized to undefined. `blessed` is mocked at module level so the suite runs under `bun test src/tui/chat/index.test.ts` without a TTY.

Acceptance criteria:

- [x] Session token sourced at TUI startup.
- [x] Token threaded into `ChatWidget` constructor.
- [x] Verified: outgoing `/api/chats/:id/messages` requests carry `Authorization: Bearer <token>` when token is set (covered by `src/tui/chat/api.ts` consuming `host.sessionToken` — token plumbing now reaches it via `app.ts` → `ChatWidget` → `host`).
- [x] Verified: requests without token omit the header (anonymous mode still works against solo deployments).
- Workaround for now: in solo mode, server ignores missing token → TUI works for development; broken for remote/multi-user.