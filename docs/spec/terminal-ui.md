<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# TUI Implementation Details

TUI built with `blessed` + `blessed-contrib` (current stack). Renderer migration to `@oh-my-pi/pi-tui` is in progress — see `.plan/tickets/TASK-migrate-tui-renderer-from-blessed-to-oh-my-pi-pi-tui.md`. Terminal chat interface with integrated asset viewer. Run: `bun run src/tui/app.ts` (backend on default port 3000).

## Implemented

- Entry `src/tui/app.ts` — `createTUIApp()` factory behind an `import.meta.main` guard; blessed screen (smartCSR); Escape/q/Ctrl+C quits (Esc closes open overlays first); status bar with resize handler.
- Chat: `src/tui/chat/` (`index.ts`, `api.ts`, `display.ts`, `commands.ts`, `types.ts`) — scrollable history, `setChatId()`, asset loading per chat. Slash-command completion strip above the input box fetches from `GET /api/v1/commands` and renders a hint line; Tab cycles matches, Enter commits the highlighted one. (Old flat `src/tui/chat.ts` no longer exists.)
- Asset view `src/tui/asset-view.ts` — right sidebar (30 % width); Left/Right arrow keys cycle through linked assets; shows name, type, MIME, size, creation date, and alt text.
- Chat picker `src/tui/chat-picker.ts` — full-screen overlay (F1) listing the user's chats from `GET /api/v1/chats`; Enter selects and hides it, routing through `ChatWidget.setChatId()`.
- Harness overlay `src/tui/harness/index.ts` — full-screen overlay (F3); Up/Down navigates runs, Enter loads detail; refreshes on every toggle.
- Models overlay `src/tui/models-overlay.ts` — full-screen admin overlay (F6); three-level drill-down: roles → providers → models; shows `source` diagnostic per row; also surfaces provider health and a per-provider connection-test button.
- Provider-health status segment — live health segment in the status bar (rightmost); `GET /api/v1/providers` requires no auth; refreshed on startup and on every F5.
- Integration: `GET /api/v1/assets?entity_type=chat&entity_id=…` (asset service), `POST/GET /api/v1/chats/:id/messages` (assistant service), `GET /api/v1/commands` (slash-command registry), `GET /api/v1/providers` (public health), `GET /api/v1/harness/runs` (harness run list), `GET /api/v1/harness/runs/:runId` (harness run detail), `GET /api/v1/harness/stats` (harness aggregate stats); base URL from `LOOP_LORE_API_BASE_URL` env or `http://localhost:3000`.

## Platform notes

- Windows: Windows Terminal/ConEmu/WSL2; no mouse or resize events (blessed limitation — expected to change with the pi-tui migration) — use WSL2 for full experience.
- Android (Termux): needs terminfo-capable terminal; server binaries must be compiled for Android or use Termux packages.

## Not implemented / aspirational

- Theming, mouse support, thumbnails, command history, split views, custom keybindings.

## Epics

- `.plan/epics/epic-terminal-ui.md`
