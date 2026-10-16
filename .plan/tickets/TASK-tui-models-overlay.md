<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI admin models overlay

**Status:** Done
**Priority:** medium
**Effort:** Large
**Epic:** `epic-terminal-ui`
**Tags:** tui, admin, models
**Summary:** Full-screen overlay for model-role assignment and provider health, so an operator over ssh can see which model each role actually resolved to and reassign it.
**Context:** The `admin.system` routes (`src/routes/admin/model-roles.ts`, `src/routes/admin/providers.ts`) already expose every role's resolved `provider`/`model` plus the `source` that decided it (`db` \| `config` \| `default`, `src/admin/model-roles.ts:33-51`). That `source` is the diagnostic an operator wants over ssh — "why isn't this using the model I set" — and nothing in the TUI surfaces it. Reuse-first: the overlay is built from the same blessed `box` + `list` + `text` shape as `chat-picker.ts`, the HTTP layer uses its own `setFetch` seam rather than `mock.module`, and the keybinding sits in the existing F-block in `src/tui/app.ts`. No new widget library, no second screen framework, no new server route.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [x] Overlay lists every resolved model role with its `source` (`db`/`config`/`default`), so an override that was never applied is visible.
- [x] Drill-down roles → providers → models commits a real `PUT /api/v1/admin/model-roles/:role`; `c` clears the override via `DELETE`; `r` re-scans providers via `POST /api/v1/admin/providers/rescan`.
- [x] Built from the blessed `box`/`list`/`text` shape already used at `src/tui/chat-picker.ts` and `src/tui/harness/index.ts:59` — no new widget library, no second screen framework.
- [x] Keybinding follows the `src/tui/app.ts` convention: **F6**, the next free key in the F-block (F4 stays reserved by `TASK-harness-topic-tui-surface`); Esc/q dismisses the overlay rather than quitting the shell.
- [x] Provider health, model count, latency and last error are rendered; a `403` from any admin route degrades to a plain "admin only" line instead of an error, since a non-admin opening the overlay is a normal state.
- [x] HTTP layer is exercisable through its own `setFetch` seam — no `mock.module`, so the tests run in a plain shared `bun test` like `chat-picker.test.ts`.
- [x] Selection is a single tracked `cursor` (blessed's own key handling is disabled) so Enter and `c` can never act on a different row than the one highlighted.
- [x] Row formatters live in `src/tui/models-display.ts`, mirroring the `harness/display.ts` split, keeping the widget under its size budget.
- [x] Tests cover the drill-down and commit path, the clear path, the re-scan path, cursor clamping, and the `403` degradation.
- [x] Web parity reference (`src/frontend/alpine/admin-models/`, rendered by `src/views/admin.html:846`) consulted for the endpoint shapes; no server route added.
- [x] `bun run check` green.

## Deliberately not built

- **Temperature / maxTokens editors.** `PUT /model-roles/:role` accepts them, but they need free-text numeric entry with validation — that is a text-box surface, not a list surface, and the web client already does it.
- **Capabilities registry, plugin toggles, anything destructive.** Same reason: not a list-plus-a-selection.

## Related Files

- `src/tui/models-api.ts` (HTTP layer + `setFetch` seam), `src/tui/models-overlay.ts` (`ModelsOverlay`), `src/tui/models-display.ts` (row formatters)
- `src/tui/app.ts` (F6 binding, Esc dismissal, status hint)
- `src/routes/admin/model-roles.ts:38-51`, `src/routes/admin/providers.ts:51-76`, `src/admin/model-roles.ts:33-51` (field shapes and `source`)
- `src/tui/chat-picker.ts`, `src/tui/harness/index.ts:59`, `src/tui/harness/display.ts` (reused shapes)
- `TASK-tui-chat-picker`, `TASK-harness-topic-tui-surface`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
