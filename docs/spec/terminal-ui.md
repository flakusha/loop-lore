<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# TUI Implementation Details

TUI built with `blessed` + `blessed-contrib`. Terminal chat interface with integrated asset viewer. Run: `bun run src/tui/app.ts` (backend on default port 3000).

## Implemented

- Entry `src/tui/app.ts` — blessed screen (smartCSR), quit via Escape/q/Ctrl+C, layout, cleanup.
- Chat: `src/tui/chat/` (`index.ts`, `api.ts`, `display.ts`, `types.ts`) — scrollable history, `setChatId()`, asset loading per chat, plus NSFW filtering (`src/tui/nsfw-filter.ts`). (Old flat `src/tui/chat.ts` no longer exists.)
- Asset view `src/tui/asset-view.ts` — Left/Right navigate, Enter link feedback, Delete removes; shows type/URL/caption.
- Integration: `/api/assets` (asset service), `/api/assistant` (assistant service); base URL from env or relative.

## Platform notes

- Windows: Windows Terminal/ConEmu/WSL2; no mouse or resize events (blessed limitation) — use WSL2 for full experience.
- Android (Termux): needs terminfo-capable terminal; server binaries must be compiled for Android or use Termux packages.

## Not implemented / aspirational

- Theming, mouse support, thumbnails, command history, split views, custom keybindings.

## Epics

- `.plan/epics/epic-terminal-ui.md`
