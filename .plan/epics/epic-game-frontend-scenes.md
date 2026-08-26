<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Game Frontend Scenes (2D/3D)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Feature Epic
**Tags:** game-frontend, 2d-scenes, webgl, interactive, click-to-chat
**Parent Epic:** Embeddable Engine & 2D/3D Game Frontend (epic-embeddable-engine-game-frontend.md)

## Summary

In-app interactive 2D scenes with clickable components whose interactions
propagate into chat as story events, plus a browser WebGL spike to scope a 3D
frontend. Rendering targets canvas/WebGL in the browser; realtime input flows
over WebSocket / WebTransport.

## Sub-Epic of

Part of the **Embeddable Engine & 2D/3D Game Frontend** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

| Layer              | Implementation                                           |
| ------------------ | -------------------------------------------------------- |
| Rendering          | Browser (canvas/WebGL)                                   |
| Realtime           | WebSocket / WebTransport (see transport-expansion)       |
| Interactive scenes | 2D scene with clickable components propagating into chat |

### Scene Contract

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

## Tasks

- [ ] 2D interactive scene renderer + click→event bridge
- [ ] 3D frontend spike (browser WebGL)
- [ ] Define scene component click→StoryEvent payload contract (shared with `epic-game-engine-sdks.md` example scenes)

## Dependencies

- Parent hub: **Embeddable Engine & 2D/3D Game Frontend** (`epic-embeddable-engine-game-frontend.md`).
- Siblings: consumes `epic-embeddable-backend.md` (StoryEvent stream + service endpoints).
- External: blocked on `epic-transport-expansion.md` (WS/WT realtime) and `epic-headless-alternative-frontends.md` (headless mode).

## Files

- `src/frontend/game/` — 2D / 3D frontend (future)
- depends on `src/transport/ws.ts`, `src/transport/webtransport.ts` (transport-expansion)
