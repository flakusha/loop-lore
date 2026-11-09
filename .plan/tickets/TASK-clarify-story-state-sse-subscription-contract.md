<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CLARIFY-story-state-sse-subscription-contract

**Status:** In Progress
**Status Note:** 2026-11-09 (T4 core-t4-story): contract written + implemented (server `story-stream.ts`, client `story-state/stream.ts`); verification pending.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-story-mode-ui
**Tags:** frontend, story
**Summary:** Subscribe window.storyState.refresh to the world-scoped snapshot/event SSE feed instead of poll-only re-pull.
**Context:** TASK-story-alpine SSE criterion open; feed contract owned by git issue 580d430; refresh() re-pull retained as offline fallback.
**Acceptance Criteria:** SSE subscription with reconnect plus stale-chatId guard; poll fallback retained.

## Contract (implemented T4, 2026-11-09)

Endpoint: `GET /api/v1/worlds/:worldId/story-stream`
(`src/routes/story-states/stream.ts`; mounted via `src/routes/story-states/index.ts`).
Auth: world read access (owner / `admin.world` / member / public-authenticated)
via `requireWorldAccess` — same gate as the sibling read endpoints. Reuses the
repo SSE scaffold `src/routes/sse-stream.ts` (poll-and-diff, same as
`src/routes/worlds/world-stream.ts`): `text/event-stream`, `ping` keepalive
8s (beats Bun.serve's 10s idle timeout), poll 15s.

Event: exactly one name, `story-state`. Payload: counts + freshness watermarks
per slice (never full JSON blobs):
`{ worldStates: { count, updatedAt }, npcStates, locationStates, quests }`.
`world_states` is append-only so its watermark is `created_at`; the rest use
`updated_at`; empty tables yield `{ count: 0, updatedAt: null }`.

Semantics:
- reconnect replays the current snapshot immediately on subscribe (`onStart`);
  ticks emit only when the fingerprint changes (`counts|watermarks` per slice).
- there is deliberately NO per-entity event (`npc-updated`, …): a change event
  would need a push bus, which the repo does not have — every SSE route
  (activity, notifications, world conditions) is poll-and-diff. The client
  re-runs `refresh()` on each `story-state` event to converge.
- client (`src/frontend/alpine/story-state/stream.ts`): `connectStoryStream()`
  opens `EventSource(/api/v1/worlds/:worldId/story-stream)` after each
  successful `refresh()`; `disconnectStoryStream()` closes on chat switch.
  Stale-world guard: frames arriving after the story moved worlds are dropped.
- `refresh()` re-pull is retained as the offline/fallback path (no EventSource,
  closed stream, or undecodable frame never blocks a manual load).
- `storyTurnOrder()` has no separate socket: `stepWith`/`setInitiative` reload
  the snapshot after each mutation; the turn-order panel refreshes with the
  same `chat-context-refresh` + `story-state`-event cadence.

## Summary

Subscribe window.storyState.refresh to the world-scoped snapshot/event SSE feed instead of poll-only re-pull. Parent: TASK-story-alpine (SSE criterion open). Feed contract owned by git issue 580d430. Keep refresh() re-pull as offline fallback; add reconnect plus stale-chatId guard.

## Acceptance Criteria

- [x] SSE subscription with reconnect (EventSource auto-reconnect + `onStart` snapshot replay — `src/routes/story-states/stream.ts`, `src/frontend/alpine/story-state/stream.ts`)
- [x] Stale-chatId guard (client drops frames whose world differs + disconnects on chat switch — `src/frontend/alpine/story-state/stream.ts`, `src/frontend/alpine/story-state.ts`)
- [x] Poll fallback retained (`refresh()` re-pull stays the offline path; no EventSource never blocks a load — `src/frontend/alpine/story-state.ts`)
