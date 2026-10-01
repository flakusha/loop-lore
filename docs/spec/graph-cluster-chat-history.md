<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Graph Cluster: Chat History Travel

> Substrate: FEAT-generic-2d-graph-canvas-renderer
> (`graph-canvas/{types,draw,index}.ts`: nodes `id/label/kind/color`,
> edges `from/to/label`, static layout, no force-physics v1).
> Precedent: `game-canvas` (`draw.ts` + `index.ts`) is import-one-direction-only.

## 1. Model

Linear chain: `messages.parent_id` links each row to its predecessor.
Named branches: `chat_branches` rows keyed to a fork-point
`parent_message_id`; `chats.active_branch_id` selects the display branch.
Branch message chain = `walkMessagePath` from fork point
(`src/chat/service/branch-helpers.ts`). No stored fork edges —
branching is metadata over linear chains.

Key APIs: `forkBranch` / `switchActiveBranch` / `listBranches`
(`src/chat/service/branches.ts`), `resubmitMessage`
(`src/chat/service/message-history.ts`), `exportChat`
(`src/chat/export/formats.ts`).

## 2. Node/edge mapping

- **Message nodes:** one node per message (`id`, role, snippet, timestamp).
- **Branch nodes:** one node per `chat_branches` row (name, active flag).
- **Reply edges:** `parent_id` links (linear chain).
- **Fork edges:** branch node → fork-point message (derived, not stored).
- **Resume edges:** branch node → tip message of its chain.

Kind colors follow `game-canvas` `KIND_COLORS` pattern (`#9ca3af` fallback).

## 3. Gaps

- `ExportPayload` carries role/content/createdAt only — no `parent_id`,
  no branch/fork metadata; no import path exists at all.
- `graph-canvas/` is spec-only (FEAT ticket Not Started).
- `game-canvas` `draw.ts` draws grid tokens only — no edge primitive.
- `docs/spec/conversation-branching.md` is a stub (no implementation detail).

## 4. Implementation phases

1. **Export parent_id + branches:** extend `ExportPayload`/`MessageData`
   with `parent_id`, branch rows, `active_branch_id`.
2. **Import reconstruct:** rebuild `parent_id` chains + `chat_branches`
   records from exported payload (extends TASK-chat-history-import-export).
3. **Canvas render + click-travel:** map rows to graph-canvas nodes/edges;
   static layout; node click jumps the reader to that message (read-only v1).

## 5. Bindings

- Tasks: `TASK-chat-history-import-export`
  (export exists without branch metadata; import missing),
  `FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas` (substrate).
- Epics: `epic-chat-lifecycle-moderation` (chat modes; no graph spec of its own).
