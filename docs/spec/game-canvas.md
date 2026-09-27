<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# 2D Game Canvas & Game-State Pipeline

## Purpose

Render the tactical/scene state of an RPG chat as an interactive 2D canvas in
the web UI, fed by structured game state extracted from LLM narration. The
same extracted state feeds a diff-analysis pass whose summary is re-injected
into the prompt, closing the loop: narration → state → canvas + analysis →
next-turn context.

## Data Flow

```
LLM narration (assistant message)
  └─ fenced ```game-state JSON block
       └─ src/regex/game-state.ts extractor (compiled patterns, barrel-exported)
            └─ src/game-state/service.ts  extractAndStore() — called post-insert
               from src/story/game-master/narration.ts (non-fatal on error)
                 └─ game_states table (migration 021)
                      ├─ src/game-state/analyze.ts — diff vs previous state
                      │    └─ src/assistant/prompt/sections/game-state.ts
                      │         (instruction block + compact state summary)
                      └─ GET /api/v1/chats/:id/game-state(s)
                           └─ Alpine gameCanvas(chatId) component
                                └─ <canvas> grid + token render
```

## Contracts

### GameState (TypeBox, `src/validation/schemas.ts`)

```ts
GameState = t.Object({
  grid: t.Object({ width: t.Integer(), height: t.Integer() }),
  entities: t.Array(t.Object({
    id: t.String(),
    name: t.String(),
    kind: t.Union([t.Literal("pc"), t.Literal("npc"), t.Literal("enemy"),
                   t.Literal("object")]),
    x: t.Integer(), y: t.Integer(),
    color: t.Optional(t.String()),
    label: t.Optional(t.String()),
  })),
  items: t.Optional(t.Array(t.Object({ id, name, x, y }))),
  caption: t.Optional(t.String()),
})
```

Grid coordinates are integer cells, origin top-left. Grid size clamped at
64×64 for rendering; larger grids are stored as-is and render clamped.

### Analysis (`src/game-state/analyze.ts`)

```ts
GameStateAnalysis = {
  movements: [{ entityId, from: {x,y}, to: {x,y} }],
  added: [entityId],
  removed: [entityId],
  caption?: string,
}
```

Diff of latest vs previous persisted state for the chat. First state →
`movements: []`, all entities in `added`.

### API (`src/routes/game-state.ts`)

| Route | Response |
| --- | --- |
| `GET /api/v1/chats/:id/game-state` | `{ messageId, createdAt, state, analysis }` (404 when none) |
| `GET /api/v1/chats/:id/game-states?limit=N` | `{ data: [{ id, messageId, createdAt }] }` (desc, default limit 20) |

Registered once at `/api/v1` (no legacy `/api` twin — avoids adding to the
known route-param duplicate-warning class).

### LLM emission format

One fenced block per scene beat, emitted when spatial layout changes:

````
```game-state
{"grid":{"width":8,"height":6},"entities":[{"id":"hero","name":"Aria","kind":"pc","x":2,"y":3}]}
```
````

Blocks are stripped from the rendered message body (same treatment as other
machine-directed blocks). Malformed JSON: block skipped, structured-log warn,
never throws into the chat flow.

## Integration Points

| Concern | File |
| --- | --- |
| Extractor patterns | `src/regex/game-state.ts` (+ barrel `src/regex/index.ts`) |
| Persistence hook | `src/story/game-master/narration.ts` post-insert, non-fatal |
| Service + analysis | `src/game-state/{service,analyze,index}.ts` |
| Routes | `src/routes/game-state.ts` + `src/app/register-plugins.ts` |
| Alpine component | `src/frontend/alpine/game-canvas.ts` (globalThis pattern), imported in `src/frontend/alpine-init.ts` |
| Partial | `src/components/chat/game-canvas.html` (`{{> chat/game-canvas.html }}`) |
| View mount | `src/views/chat.html` after the story-view include |
| Prompt | `src/assistant/prompt/sections/game-state.ts` + `PROMPT_SECTIONS` registry entry |
| Migration | `src/db/migrations/021_game_states.ts` (+ `db:sync-types`, `db:sync-manifest` regen) |

## Canvas Rendering Rules

- Cell size derived from container width ÷ grid width, clamped 16–48 px.
- Entities: filled circle, kind-differentiated color (pc=blue, npc=green,
  enemy=red, object=gray) unless `color` override; label text (name or
  `label`) beside/under token, 11px sans.
- Items: small diamond marker.
- Click: hit-test tokens → selected token detail box (name, kind, position)
  below canvas; click empty cell deselects.
- Refresh: manual button + 15s interval while `document.visibilityState ===
  "visible"`. SSE `game-state` event extension noted as future work; the
  activity SSE stream stays untouched in this slice.
- Empty/absent state: caption-only placeholder text, no grid draw.
- Partial swap (htmx) re-initializes the component; selection is not
  preserved across swaps (accepted).

## Edge Cases

- No state yet for chat → 404 on latest endpoint; canvas shows placeholder.
- Entity outside grid bounds → stored, render clamps into grid.
- Duplicate entity ids within one state → last wins on id-keyed maps;
  analysis compares by id.
- Concurrent narration inserts → last-writer-wins on created_at ordering;
  analysis picks immediately-previous row by created_at, ties broken by id.
- Extractor must not match `game-state` inside user-quoted code fences of
  other languages; fence opener must be exactly ` ```game-state `.

## Alternatives Considered

- **Reuse `interaction_logs`**: rejected — dice/interaction ledger, no
  positional scene state; overloading muddies both domains.
- **Derive state from story-events regex**: rejected — story-events extract
  narrative mentions, not authoritative spatial snapshots; LLM-emitted block
  is the single source of truth.
- **WebSocket push**: rejected for this slice — chat UI listens on SSE
  activity stream; polling matches the existing notifications pattern.
- **SVG/DOM tokens instead of canvas**: viable but canvas keeps token count
  scaling simple and matches the "2D game canvas" requirement.

## Out of Scope (future tickets)

- Token drag-to-move writing state back through API.
- Sprite/image assets per entity (currently colored tokens).
- Fog-of-war / per-player visibility.
- TUI canvas rendering (blessed).
