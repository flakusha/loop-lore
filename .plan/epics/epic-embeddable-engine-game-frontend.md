<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Embeddable Engine & 2D/3D Game Frontend (Far Fetched)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Very High
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

This epic depends on `epic-transport-expansion.md` (WS/WT realtime) and
`epic-headless-alternative-frontends.md` (headless mode). It is intentionally
low-priority / vision-grade.

## Embeddable Backend

| Surface         | Description                       |
| --------------- | --------------------------------- |
| Generation API  | Other apps request LLM generation |
| World/state API | Read/write world + story state    |
| Auth boundary   | Scoped API keys per consuming app |

## Event-Story Engine

Reuses `src/story/` + `src/turning/` (TurnManager) to drive non-scripted
interactions. Emits an event stream consumable by any frontend.

```typescript
interface StoryEvent {
  id: string;
  type: "narrative" | "state_change" | "interaction";
  payload: unknown;
  timestamp: number;
}
```

## 2D / 3D Game Frontend

| Layer              | Implementation                                           |
| ------------------ | -------------------------------------------------------- |
| Rendering          | Browser (canvas/WebGL) or native OS                      |
| Realtime           | WebSocket / WebTransport (see transport-expansion)       |
| Interactive scenes | 2D scene with clickable components propagating into chat |

```typescript
interface InteractiveScene {
  id: string;
  components: SceneComponent[]; // clickable
  on_click: (c: SceneComponent,) => StoryEvent;
}

interface SceneComponent {
  id: string;
  bounds: [number, number, number, number,];
  label: string;
}
```

## Desktop App Strategy

### Electron

- **Architecture**: Web UI (React/Preact) wrapped in Electron main process
- **IPC**: Main process ↔ renderer via Electron IPC for native features
- **Packaging**: `electron-builder` for cross-platform (Windows, macOS, Linux)
- **Auto-update**: Electron auto-updater with GitHub releases
- **Native modules**: Pre-compiled via `electron-rebuild` or `prebuildify`

### Tauri

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

### Desktop Implementation Tasks

- [ ] Choose Electron vs Tauri (recommend Tauri for size)
- [ ] Create desktop wrapper project (`loop-lore-desktop/`)
- [ ] Implement native menu bar (File, Edit, View, Window)
- [ ] Implement system tray icon with notifications
- [ ] Add offline support (local DB sync)
- [ ] Add file system access for asset management
- [ ] Implement auto-update mechanism
- [ ] Package for Windows (NSIS), macOS (DMG), Linux (AppImage)
- [ ] Add desktop-specific settings (theme, window state, shortcuts)

## Mobile App Strategy

### React Native

- **Architecture**: React Native CLI or Expo for cross-platform mobile
- **API**: Consumes `@loop-lore/client` + `@loop-lore/react` (shared with web)
- **UI**: React Native components + shared design tokens
- **Native features**: Camera (avatar upload), Push notifications, Offline storage

### Capacitor

- **Architecture**: Web UI (React/Preact) wrapped in Capacitor
- **API**: Same as web — `@loop-lore/client` + `@loop-lore/react`
- **Native features**: Capacitor plugins for camera, push, filesystem
- **Packaging**: Xcode (iOS), Android Studio (Android)

| Feature      | React Native                | Capacitor                     |
| ------------ | --------------------------- | ----------------------------- |
| Code sharing | Partial (native components) | Full (web UI)                 |
| Performance  | Native                      | WebView                       |
| Development  | React Native CLI/Expo       | Web + Capacitor               |
| App store    | Yes                         | Yes                           |
| Offline      | SQLite/Realm                | IndexedDB + Capacitor Storage |

### Mobile Implementation Tasks

- [ ] Choose React Native vs Capacitor (recommend Capacitor for code reuse)
- [ ] Create mobile wrapper project (`loop-lore-mobile/`)
- [ ] Implement responsive UI for mobile screens
- [ ] Add push notification support (Firebase Cloud Messaging)
- [ ] Add offline mode with local storage sync
- [ ] Implement camera integration for avatar/asset upload
- [ ] Add mobile-specific gestures (swipe to delete, pull to refresh)
- [ ] Package for iOS (App Store) and Android (Play Store)
- [ ] Add deep linking for chat invites

## Game Engine Clients

### Unity (C#)

- **Architecture**: Unity client consuming REST + WebSocket API
- **Realtime**: WebSocket for live story events, REST for state sync
- **Rendering**: Unity 2D/3D engine with sprites/animations
- **Networking**: `WebSocketSharp` or Unity Transport Package

```csharp
// Unity C# client example
using LoopLore.Client;

public class StoryClient : MonoBehaviour {
  private LoopLoreWebSocket ws;

  async void Start() {
    ws = new LoopLoreWebSocket("wss://api.loop-lore.app/ws");
    ws.OnEvent += HandleStoryEvent;
    await ws.ConnectAsync();
  }

  void HandleStoryEvent(StoryEvent evt) {
    switch (evt.type) {
      case "narrative":
        DisplayNarrative(evt.payload.text);
        break;
      case "state_change":
        UpdateGameState(evt.payload);
        break;
      case "interaction":
        ShowInteractionPrompt(evt.payload);
        break;
    }
  }
}
```

### Godot (GDScript)

- **Architecture**: Godot client consuming REST + WebSocket API
- **Realtime**: WebSocket for live events, HTTPRequest for REST
- **Rendering**: Godot 2D engine with scenes/nodes
- **Networking**: Built-in WebSocketClient

```gdscript
# Godot GDScript client example
extends Node

var ws := WebSocketClient.new()

func _ready():
    ws.connect("connection_established", self, "_on_ws_connected")
    ws.connect("data_received", self, "_on_ws_data")
    ws.connect_to_url("wss://api.loop-lore.app/ws")

func _on_ws_data():
    var pkt := ws.get_packet()
    var evt := JSON.parse(pkt.get_string_from_utf8()).result
    match evt.type:
        "narrative":
            display_narrative(evt.payload.text)
        "state_change":
            update_game_state(evt.payload)
        "interaction":
            show_interaction_prompt(evt.payload)
```

### Game Engine Implementation Tasks

- [ ] Define game engine API contract (REST + WebSocket)
- [ ] Create Unity SDK package (`loop-lore-unity/`)
- [ ] Create Godot addon (`loop-lore-godot/`)
- [ ] Implement Unity client with WebSocket + REST
- [ ] Implement Godot client with WebSocket + HTTPRequest
- [ ] Add example 2D scene with clickable components
- [ ] Add example 3D scene with character controllers
- [ ] Document game engine integration patterns
- [ ] Add game engine-specific error handling and reconnection logic

## Tasks (vision)

- [ ] Define embeddable backend API surface + scoped keys
- [ ] Expose generation + world/state as service endpoints
- [ ] Event-stream emission from story/turning engine
- [ ] Realtime channel selection (WS vs WT) wiring
- [ ] 2D interactive scene renderer + click→event bridge
- [ ] 3D frontend spike (browser WebGL)
- [ ] Desktop app (Electron/Tauri) wrapper
- [ ] Mobile app (React Native/Capacitor) wrapper
- [ ] Unity C# client SDK
- [ ] Godot GDScript client SDK

## Files (proposed)

- `src/embed/backend.ts` — embeddable service surface
- `src/embed/auth.ts` — scoped API keys
- `src/story/event-stream.ts` — event emission
- `src/frontend/game/` — 2D / 3D frontend (future)
- `loop-lore-desktop/` — desktop app (Electron/Tauri)
- `loop-lore-mobile/` — mobile app (React Native/Capacitor)
- `loop-lore-unity/` — Unity SDK
- `loop-lore-godot/` — Godot addon
- depends on `src/transport/ws.ts`, `src/transport/webtransport.ts` (transport-expansion)

## Linked Tasks

- TASK-embeddable-engine-game-frontend.md
