# EPIC: Embeddable Engine & 2D/3D Game Frontend (Far Fetched)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Very High
**Type:** Vision Epic
**Tags:** embeddable, event-engine, game-frontend, realtime, webtransport

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

## Tasks (vision)

- [ ] Define embeddable backend API surface + scoped keys
- [ ] Expose generation + world/state as service endpoints
- [ ] Event-stream emission from story/turning engine
- [ ] Realtime channel selection (WS vs WT) wiring
- [ ] 2D interactive scene renderer + click→event bridge
- [ ] 3D frontend spike (browser WebGL)

## Files (proposed)

- `src/embed/backend.ts` — embeddable service surface
- `src/embed/auth.ts` — scoped API keys
- `src/story/event-stream.ts` — event emission
- `src/frontend/game/` — 2D / 3D frontend (future)
- depends on `src/transport/ws.ts`, `src/transport/webtransport.ts` (transport-expansion)

## Linked Tasks

- TASK-embeddable-engine-game-frontend.md
