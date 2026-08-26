<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Embeddable Engine & 2D/3D Game Frontend (Far Fetched)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Very High (split into 5 sub-epics)
**Type:** Vision Epic
**Tags:** embeddable, event-engine, game-frontend, realtime, webtransport, desktop, mobile

## Overview

Long-horizon vision from the "Far Fetched" ideas bucket: position loop-lore as a
**backend / engine for other applications** rather than a self-contained chat app.

Three pillars:

1. **Embeddable backend** — expose loop-lore's generation + world + story state
   as a service other apps call.
2. **High-performance event-story engine** — glue non-fixed, non-scripted
   interactions (e.g. games) using the existing story/turning orchestration.
3. **2D / 3D game frontend** — native OS or browser implementation with
   high-frequency realtime processing over WebSocket / WebTransport, including
   in-app interactive 2D scenes with clickable components for chat propagation.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 5 sub-epics. Each sub-epic delivers independently shippable value; this file remains the hub for scope and sequencing.

This epic depends on `epic-transport-expansion.md` (WS/WT realtime) and
`epic-headless-alternative-frontends.md` (headless mode). It is intentionally
low-priority / vision-grade.

## Sub-Epics

| Sub-Epic                  | Epic File                                    | Scope                                                                                     | Priority | Blocked On                                        |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------- |
| **Embeddable Backend**    | `epic-embeddable-backend.md`                 | Service surface, scoped API keys, event-stream emission (story/turning), WS-WT wiring      | Low      | — (only pre-dependency slice)                     |
| **Game Frontend Scenes**  | `epic-game-frontend-scenes.md`               | 2D clickable-scene renderer + click→chat event bridge; 3D WebGL spike                      | Low      | Embeddable Backend, transport-expansion, headless |
| **Desktop App**           | `epic-desktop-app.md`                        | Electron-vs-Tauri decision, `loop-lore-desktop/` wrapper, tray/menus/auto-update/packaging | Low      | transport-expansion + headless frontends          |
| **Mobile App**            | `epic-mobile-app.md`                         | RN-vs-Capacitor decision, `loop-lore-mobile/` wrapper, push/camera/offline/deep-linking    | Low      | transport-expansion + headless frontends          |
| **Game Engine SDKs**      | `epic-game-engine-sdks.md`                   | Unity SDK package + Godot addon, example scenes, reconnection handling, integration docs   | Low      | transport-expansion + headless frontends          |

## Slicing Rationale & Sequencing

1. **Embeddable Backend** is the only pre-dependency slice: every frontend
   surface (scenes, desktop, mobile, engine SDKs) consumes its service surface,
   scoped keys, and StoryEvent stream.
2. **Game Frontend Scenes** additionally depends on the backend's event stream.
3. **Desktop**, **Mobile**, and **Game Engine SDKs** are mutually independent;
   all are blocked on `epic-transport-expansion.md` and
   `epic-headless-alternative-frontends.md`.

Per-subsystem design blocks, technology comparisons, code examples, and task
lists live in the linked sub-epic files above.

## Files (proposed)

- `src/embed/backend.ts` — embeddable service surface → Embeddable Backend
- `src/embed/auth.ts` — scoped API keys → Embeddable Backend
- `src/story/event-stream.ts` — event emission → Embeddable Backend
- `src/frontend/game/` — 2D / 3D frontend (future) → Game Frontend Scenes
- `loop-lore-desktop/` — desktop app (Electron/Tauri) → Desktop App
- `loop-lore-mobile/` — mobile app (React Native/Capacitor) → Mobile App
- `loop-lore-unity/` — Unity SDK → Game Engine SDKs
- `loop-lore-godot/` — Godot addon → Game Engine SDKs
- depends on `src/transport/ws.ts`, `src/transport/webtransport.ts` (transport-expansion)

## Related Epics

- `epic-transport-expansion.md` — WS/WT realtime channels (external dependency)
- `epic-headless-alternative-frontends.md` — headless mode (external dependency)
- `epic-api-library-distribution.md` — client library packaging (`@loop-lore/client`, `@loop-lore/react`)

## Linked Tasks

- TASK-embeddable-engine-game-frontend.md
