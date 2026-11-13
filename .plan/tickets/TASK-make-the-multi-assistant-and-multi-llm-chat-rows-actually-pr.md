<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Make the multi-assistant and multi-LLM chat rows actually produce messages

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-variants-taxonomy.md
**Tags:** group-chat, story-mode, auto-generation

**Summary:**

Of the 12 chat variants (`src/chat/types/variants.ts:83-216`), 9 are pinned to `chat_mode="story"`, which diverts before the multi-participant cascade is ever reached: `src/generation/auto-gen/auto-generation.ts:131-141` (`resolveMode` returns `handled: true`) calls `return` before `applyPostStoreEffects` runs, so `src/generation/auto-gens/post-store.ts:219` (`triggerGroupCascade`) is unreachable. Probes (full report: `.tmp/intercom/scripts/spike-multi-llm-chat-rows.md`, dev checkout): variant 2 (group/story, 2 LLMs) produces 0 messages ("No story context available"); variant 7 (group/battle, 2 LLMs) produces 50 alternating messages; variant 6 (direct/battle, 2 LLMs) produces 1 message from always the same actor.

Story mode also hard-requires a world the UI never demands for non-RPG variants: `src/story/game-master/execute.ts:31-32` throws when `state.worldState.buildContext` returns null, which it does for a null `world_id` (`src/story/world-state/context.ts:34`); only the RPG variants require a world in the new-chat form (`src/frontend/pages/new-chat/index.ts:17`). And even with a world, story mode returns `response: null` — `execute.ts:85` hardcodes it because the GM decision strategy returns a `turnPrompt`, not a response (`src/story/gm/decisions/llm.ts:118-127`), and nobody runs the actor call that would fill it. The story unit test is green only because it mocks the GM service with a non-null response (`src/generation/auto-gen/story-mode.test.ts:52-94`). Separately, direct chats always pick the same actor: `resolve-actor.ts:75-83` uses `executeTakeFirst()` with no rotation.

Fix (4 changes, no schema, no migration — `max_turns`/`auto_advance`/`turn_strategy` already exist and the cascade already reads them in `group-cascade.ts:130-138`):

1. Story mode returns a response: `src/story/game-master/execute.ts` runs the selected actor's LLM with the GM decision's `turnPrompt` after `getGmDecision` instead of leaving `response` hardcoded null at line 85 (reuse/extend the prompt-to-actor helper in `src/story/game-master/decisions.ts`).
2. World-less story works: `src/story/world-state/context.ts` synthesises a minimal context when `chat.world_id` is null instead of returning null at line 34; `execute.ts:31-32` keeps the throw only for a genuinely unbuildable context. Update `src/story/world-state/index.coverage.test.ts:69-74`, which pins the null return.
3. Story mode cascades: `src/generation/auto-gen/story-mode.ts` invokes `triggerGroupCascade` after `storeStoryResponse` succeeds (mirroring `post-store.ts:219-232`), gated on >= 2 eligible AI participants and on `chat.auto_advance`/`max_turns`; the taxonomy must grant `auto_advance: 1` to the multi-assistant rows (variants 2/8/10/11 carry `auto_advance: 0` today).
4. Direct rotation: `resolve-actor.ts:75-83` rotates among non-user participants when more than one exists instead of `executeTakeFirst()`; `post-store.ts:219` keeps `isGroupChat` semantics so a 1x1 direct chat does not start cascading (the rotation above gets its own turn loop, not the cascade).

New test file `src/generation/auto-gen/multi-assistant-cascade.test.ts` (7 cases, built on the `makeThrowingDeps` harness in `auto-generation.test.ts:80-135` and the `mock.module` GM double pattern in `story-mode.test.ts:23-53` with the pristine-module guard): variant-2 shape with no world yields 2 stored messages (one per LLM); variant-2 shape with a world yields 2 messages + 2 `story_turns` rows with non-null `response_received`; variant-10 shape yields 2 messages and honours `max_turns: 1` with exactly 1 message; variant-6 shape over two consecutive generations speaks from the other LLM the second time; direct 1x1 regression (exactly 1 message, no cascade); story+direct+1-LLM regression (1 message); variant-7 shape with `gm_config.actorModels` pins per-actor models on the stored messages. Each case seeds its own chat + actors with `uid()` ids and passes `database:` explicitly; per-file `:memory:` DB; parallel-safe under `bun run test:unit`.

Explicitly OUT: per-participant model pinning on the group/battle path (follow-up — `prepare-generation.ts:80` resolves one provider per chat today); deleting the dead `GmConfig` union (`variants.ts:50-60`, zero consumers outside `variants.ts` itself — migration 091 `json_extract(gm_config,'$.validation')` reads legacy rows and stays untouched; removal is a separate follow-up note, not implemented here).

**Caveats:** TOCTOU: cascade membership is snapshotted per generation; participant edits mid-round apply to the next round. Security: assistant participation stays gated by chat inclusion; per-model access permissions unchanged. Authorization: story cascade uses the same actor-eligibility rules as the battle cascade. Parallelism: per-test `:memory:` DBs, `uid()` row ids, no shared buffers — parallel-safe. Partial failure: a failed participant generation does not block the others; `max_turns` still caps the round. Rollback: story/rotation changes are code-only; no migration to unwind. Observability: cascade outcomes logged per existing auto-gen paths; story Turns rows carry `response_received`.

**Context:**

Why extend rather than normalize: flipping variant types to `group` does not touch the blocker — the gate is `mode`, and `resolveMode` returns before the cascade for every `mode="story"` chat whatever the type. The smaller change that makes the operator scope real is the three story defects plus direct rotation, each at a single choke point.

**Acceptance Criteria:**

- [ ] Variant-2-shaped group/story chat with no world stores 2 assistant messages on one user turn (no "No story context available").
- [ ] Story mode with a world stores non-null responses (`story_turns.response_received` set).
- [ ] Story cascade honours `auto_advance`/`max_turns` (multi-assistant rows gain `auto_advance: 1`; `max_turns: 1` yields exactly 1 message).
- [ ] Two consecutive direct-chat generations with 2 LLM participants speak from different actors; 1x1 direct chats still produce exactly 1 message with no cascade.
- [ ] `multi-assistant-cascade.test.ts` (7 cases) passes alone and inside the 4-worker `bun run test:unit` run.
- [ ] Per-participant model pinning and `GmConfig`-union deletion are NOT in this change (recorded follow-ups).

**Related:** TASK-1-0-0-gap-verify-multi-assistant-and-multi-llm-chat-rows.md, epic-chat-variants-taxonomy.md, epic-group-chat.md
