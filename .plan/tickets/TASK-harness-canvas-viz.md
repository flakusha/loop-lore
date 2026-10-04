<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness canvas viz (mermaid panels first)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Branch/location/memory/timeline viz as mermaid panels inside existing views (zero new deps); game-canvas overlays before any new canvas; cytoscape only on proven need.
**Context:** Rendered: `game-canvas.html` + `frontend/alpine/game-canvas/` (only true canvas: grid + tokens + diffs from `game_states` via `GET /api/v1/chats/:id/game-state`); `frontend/vn/` scene renderer; `world-timeline-bar.ts` (linear list); `chat.html`/`story-view.html` shells; `world-edit.html` explore tab (list-based). Graph-ready data: `LocationTreeService.tree()` (already tree JSON), `chat/service/branches.ts` + `walkMessagePath` (git-like DAG), `world-timeline.ts` ledger, `history-search.ts` memory→message edges. Deps installed: `mermaid@12` (devDep, no runtime import — promote first), marked/dompurify/alpine/htmx; deliberately absent: d3/cytoscape/three.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `mermaid@12` promoted devDep → runtime (bundling decision documented); branch overview (`gitGraph`/`graph TD` from `chat_branches` + `walkMessagePath`) inside a memory-panel-style partial.
- [ ] Location-tree panel in world-edit `explore` tab (`tree()` output → `graph TD` 1:1); memory→message provenance mini-graph (`flowchart LR` from `ExpandedMemoryContext`, edge weights later from injection scores).
- [ ] World-timeline lane (extend `world-timeline-bar.ts` list → lane; mermaid `timeline` or CSS/Alpine); game-canvas overlays (location pins, memory-hit markers via `draw.ts` helpers) before any new canvas.
- [ ] NOT in scope: d3 bespoke charts, gitgraph.js (archived), 3D, Gource-style animation (export JSONL, render offline); cytoscape ONLY with measured mermaid ceiling (hundreds of nodes, drag/physics).

## Related Files

- `src/frontend/alpine/game-canvas/`, `src/frontend/vn/`, `src/frontend/pages/world-timeline-bar.ts`, `src/views/chat.html`, `world-edit.html`
- `src/locations/tree.ts`, `src/chat/service/branches.ts`, `branch-helpers.ts`, `src/story/timeline/world-timeline.ts`, `src/memory/history-search.ts`, `injection/select.ts`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: daa7934
