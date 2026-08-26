<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Game Engine SDKs (Unity / Godot)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Type:** Feature Epic
**Tags:** unity, godot, sdk, game-engine, websocket, reconnection
**Parent Epic:** Embeddable Engine & 2D/3D Game Frontend (epic-embeddable-engine-game-frontend.md)

## Summary

Client SDKs for game engines: a Unity C# SDK package (`loop-lore-unity/`) and
a Godot addon (`loop-lore-godot/`) consuming the REST + WebSocket API, with
example 2D/3D scenes, reconnection handling, and integration documentation.
Both engines drive non-scripted interactions through the embeddable backend's
StoryEvent stream.

## Sub-Epic of

Part of the **Embeddable Engine & 2D/3D Game Frontend** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

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

## Tasks

- [ ] Define game engine API contract (REST + WebSocket)
- [ ] Create Unity SDK package (`loop-lore-unity/`)
- [ ] Create Godot addon (`loop-lore-godot/`)
- [ ] Implement Unity client with WebSocket + REST
- [ ] Implement Godot client with WebSocket + HTTPRequest
- [ ] Add example 2D scene with clickable components
- [ ] Add example 3D scene with character controllers
- [ ] Document game engine integration patterns
- [ ] Add game engine-specific error handling and reconnection logic


- [ ] Godot GDScript client SDK
- [ ] Unity C# client SDK

## Dependencies

- Parent hub: **Embeddable Engine & 2D/3D Game Frontend** (`epic-embeddable-engine-game-frontend.md`).
- Siblings: consumes `epic-embeddable-backend.md` (API contract + StoryEvent stream); example scenes share the click→StoryEvent payload contract from `epic-game-frontend-scenes.md`.
- External: **blocked on** `epic-transport-expansion.md` (WS/WT realtime) and `epic-headless-alternative-frontends.md` (headless mode).

## Files

- `loop-lore-unity/` — Unity SDK
- `loop-lore-godot/` — Godot addon
