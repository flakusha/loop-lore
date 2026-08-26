<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Desktop App

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Type:** Feature Epic
**Tags:** desktop, electron, tauri, tray, auto-update, packaging
**Parent Epic:** Embeddable Engine & 2D/3D Game Frontend (epic-embeddable-engine-game-frontend.md)

## Summary

Native desktop wrapper (`loop-lore-desktop/`) around the loop-lore web UI:
Electron-vs-Tauri technology decision, native menus, system tray with
notifications, offline support, file-system asset access, auto-update, and
cross-platform packaging.

## Sub-Epic of

Part of the **Embeddable Engine & 2D/3D Game Frontend** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

### Technology Decision

#### Electron

- **Architecture**: Web UI (React/Preact) wrapped in Electron main process
- **IPC**: Main process ↔ renderer via Electron IPC for native features
- **Packaging**: `electron-builder` for cross-platform (Windows, macOS, Linux)
- **Auto-update**: Electron auto-updater with GitHub releases
- **Native modules**: Pre-compiled via `electron-rebuild` or `prebuildify`

#### Tauri

- **Architecture**: Web UI (React/Preact/Svelte) wrapped in Rust binary
- **IPC**: Tauri commands bridge web ↔ Rust
- **Packaging**: `tauri-bundle` for cross-platform (smaller binaries than Electron)
- **Auto-update**: Tauri updater with GitHub releases
- **Native modules**: Rust crates for system APIs (no Node.js dependency)

| Feature           | Electron           | Tauri                |
| ----------------- | ------------------ | -------------------- |
| Binary size       | ~200-300 MB        | ~10-20 MB            |
| Memory usage      | High (Chromium)    | Low (system webview) |
| Native API access | Node.js modules    | Rust crates          |
| Development       | Familiar web stack | Web + Rust           |
| Auto-update       | Built-in           | Built-in             |

## Tasks

- [ ] Choose Electron vs Tauri (recommend Tauri for size)
- [ ] Create desktop wrapper project (`loop-lore-desktop/`)
- [ ] Implement native menu bar (File, Edit, View, Window)
- [ ] Implement system tray icon with notifications
- [ ] Add offline support (local DB sync)
- [ ] Add file system access for asset management
- [ ] Implement auto-update mechanism
- [ ] Package for Windows (NSIS), macOS (DMG), Linux (AppImage)
- [ ] Add desktop-specific settings (theme, window state, shortcuts)


- [ ] Desktop app (Electron/Tauri) wrapper
## Dependencies

- Parent hub: **Embeddable Engine & 2D/3D Game Frontend** (`epic-embeddable-engine-game-frontend.md`).
- Siblings: consumes `epic-embeddable-backend.md` (service surface).
- External: **blocked on** `epic-transport-expansion.md` (WS/WT realtime) and `epic-headless-alternative-frontends.md` (headless mode).

## Files

- `loop-lore-desktop/` — desktop app (Electron/Tauri)
