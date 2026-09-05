<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `persistInitiative` writes against the literal scene "main" — group-scene initiative ordering is broken

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-battle-action-systems, epic-chat-lifecycle-moderation
**Files:** src/routes/messages/post.ts:110-146

## Issue

`currentScene = "main"` is hardcoded with a TODO. Every initiative claim converges on `group_initiatives.scene_id='main'`, scrambling per-scene turn order.

Planned multi-scene support (`epic-battle-action-systems`, `TASK-battle-encounter-template-system.md`, `TASK-battle-template-actions.md`, `TASK-chat-battle-mode-switch.md`) requires per-scene initiative tracking. With the current hardcoded value, all initiative rows collapse to a single scene and lose scene-boundary semantics.

## Why it matters

Correctness. Battle / scene initiative ordering becomes nonsensical as soon as multiple scenes exist. A scene transition that should clear the old scene's initiative will find rows still attached to "main".

## Evidence

- `src/routes/messages/post.ts:110-146` — `currentScene = "main"` TODO.
- `src/turning/turn-manager/selection.ts:67` — `const currentScene = "main"` TODO (initiative strategy reads/decrements `group_initiatives` for the wrong scene).
- `src/turning/turn-manager/participants.ts:41` — same hardcoded `"main"` (participant initiative read path).
- `epic-battle-action-systems.md` — expects `story_state.current_scene_id` lookup.

All three sites must derive `current_scene_id` from `story_state` consistently (fix below), not just `post.ts`.

## Concrete fix

1. Replace the TODO with a `storyState.current_scene_id` lookup:

   ```typescript
   const state = await db
     .selectFrom("chats",)
     .select(["story_state",],)
     .where("id", "=", chatId,)
     .executeTakeFirst();
   const parsed = state?.story_state ? jsonParseOr<{ current_scene_id?: string }>(state.story_state, {}) : {};
   const currentScene = parsed.current_scene_id ?? "main";
   ```

2. Memoize per chat id (caches the lookup for the duration of a single request).
3. When transitioning to a new scene, persist `story_state.current_scene_id` via the existing scene-transition handler.

## Tests

- `bun test src/routes/messages/post.test.ts` — chat with `story_state.current_scene_id="scene_dungeon"` → `group_initiatives` rows reference `scene_id="scene_dungeon"`, not "main".
- Scene transition: update `story_state.current_scene_id`, send next initiative claim, verify rows go to the new scene.

## Related

- `epic-battle-action-systems.md`, `TASK-battle-encounter-template-system.md`, `TASK-battle-template-actions.md`.
- `epic-chat-lifecycle-moderation.md`.
