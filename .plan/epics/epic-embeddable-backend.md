<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Embeddable Backend

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** Feature Epic
**Tags:** embeddable, api-surface, scoped-keys, event-stream, realtime
**Parent Epic:** Embeddable Engine & 2D/3D Game Frontend (epic-embeddable-engine-game-frontend.md)

## Summary

Expose loop-lore's generation + world + story state as a service other
applications call: the embeddable service surface, scoped API keys per
consuming app, and event-stream emission from `src/story/` + `src/turning/`
(TurnManager) with WebSocket/WebTransport channel wiring. **This is the only
pre-dependency slice of the parent epic** — desktop, mobile, scenes, and game
engine SDKs all consume its surface.

## Sub-Epic of

Part of the **Embeddable Engine & 2D/3D Game Frontend** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

### Service Surface

| Surface         | Description                       |
| --------------- | --------------------------------- |
| Generation API  | Other apps request LLM generation |
| World/state API | Read/write world + story state    |
| Auth boundary   | Scoped API keys per consuming app |

### Event Stream

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

Realtime channel selection (WS vs WT) is wired against
`src/transport/ws.ts` / `src/transport/webtransport.ts` from
`epic-transport-expansion.md`.

## Tasks

- [ ] Define embeddable backend API surface + scoped keys
- [ ] Expose generation + world/state as service endpoints
- [ ] Event-stream emission from story/turning engine
- [ ] Realtime channel selection (WS vs WT) wiring
- [ ] Scoped API key issuance, rotation, and revocation per consuming app
- [ ] StoryEvent envelope schema with ordering/delivery guarantees on the stream
- [ ] Integration docs + minimal example consumer app

## Dependencies

- Parent hub: **Embeddable Engine & 2D/3D Game Frontend** (`epic-embeddable-engine-game-frontend.md`).
- External: `epic-transport-expansion.md` (WS/WT channels), `epic-headless-alternative-frontends.md` (headless mode).
- Siblings: none required first — this is the only pre-dependency slice; all other sub-epics (scenes, desktop, mobile, engine SDKs) depend on this one.

## Files

- `src/embed/backend.ts` — embeddable service surface
- `src/embed/auth.ts` — scoped API keys
- `src/story/event-stream.ts` — event emission
- depends on `src/transport/ws.ts`, `src/transport/webtransport.ts` (transport-expansion)

## Linked Tasks

- TASK-embeddable-engine-game-frontend.md
