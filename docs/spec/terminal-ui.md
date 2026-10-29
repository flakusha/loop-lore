<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# TUI Implementation Details

TUI built with `@oh-my-pi/pi-tui` (pinned exact, imported through package SUBPATHS only — `src/tui/pi.ts` is the sole module allowed to name the package). Terminal chat interface with integrated asset viewer. Run: `bun run src/tui/app.ts` (backend on default port 3000).

## Implemented

- Entry `src/tui/app.ts` — `createTUIApp()` factory behind an `import.meta.main` guard; a pi-tui `TUI` over `ProcessTerminal`, with an `AppShell` root component (chat column + optional 30 % asset sidebar + one-row status bar). Escape/q/Ctrl+C quits (Esc closes open overlays first; q quits only while no text field is typing). Resize is handled by the engine — the shell re-reads `terminal.rows` every render, so the status message survives repaints and resizes.
- Chat: `src/tui/chat/` (`index.ts`, `api.ts`, `display.ts`, `commands.ts`, `types.ts`, plus pi-tui-era `input-field.ts` and `transcript.ts`) — scrollable history (follow-tail `ScrollView`), `setChatId()`, asset loading per chat. Slash-command completion strip above the input fetches from `GET /api/v1/commands`; Tab cycles matches, Enter commits the highlighted one. Enter in the input sends (single-line semantics preserved from the blessed textbox).
- Asset view `src/tui/asset-view.ts` — right sidebar (30 % width); Left/Right arrow keys cycle through linked assets while the sidebar is visible and the chat input is not typing; shows name, type, MIME, size, creation date, and alt text. Enter attaches the highlighted asset.
- Chat picker `src/tui/chat-picker.ts` — full-screen overlay (F1) listing the user's chats from `GET /api/v1/chats`; Enter selects and hides it, routing through `ChatWidget.setChatId()`; `c` opens an inline create-chat prompt (Esc cancels the prompt without closing the picker).
- Harness overlay `src/tui/harness/index.ts` — full-screen overlay (F3); Up/Down navigates runs, Enter loads detail; refreshes on every toggle.
- Models overlay `src/tui/models-overlay.ts` — full-screen admin overlay (F6); three-level drill-down: roles → providers → models; shows `source` diagnostic per row; also surfaces provider health and a per-provider connection-test action (`p`), `c` clears a role override, `r` rescans.
- Provider-health status segment — live health segment in the status bar (rightmost); `GET /api/v1/providers` requires no auth; refreshed on startup and on every F5.
- Shared component plumbing: `src/tui/pi.ts` (package facade), `src/tui/ansi.ts` (blessed-tag → ANSI conversion for the untouched display formatters), `src/tui/menu.ts` (list component used by the three overlays), `src/tui/frame.ts` (bordered-frame helper).
- Integration: `GET /api/v1/assets?entity_type=chat&entity_id=…` (asset service), `POST/GET /api/v1/chats/:id/messages` (assistant service), `GET /api/v1/commands` (slash-command registry), `GET /api/v1/providers` (public health), `GET /api/v1/harness/runs` (harness run list), `GET /api/v1/harness/runs/:runId` (harness run detail), `GET /api/v1/harness/stats` (harness aggregate stats); base URL from `LOOP_LORE_API_BASE_URL` env or `http://localhost:3000`.

## Platform notes

- Resize works cross-platform (handled by the pi-tui engine; no blessed limitation anymore).
- Mouse: the fullscreen overlays (chat picker, harness, models) get SGR mouse reporting via pi-tui automatically; the inline chat/asset views are selection-first (no mouse) — mouse support beyond the overlays remains aspirational.
- Windows: pi-tui handles ConPTY; the prebuilt `@oh-my-pi/pi-natives` platform packages are required (installed automatically).

## Not implemented / aspirational

- Theming beyond pi-tui defaults, mouse on the inline chat list, thumbnails, command history, split views beyond the chat/sidebar split, custom keybindings.

## Epics

- `.plan/epics/epic-terminal-ui.md`
