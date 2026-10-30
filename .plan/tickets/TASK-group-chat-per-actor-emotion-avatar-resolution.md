<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Group-chat per-actor emotion-avatar resolution

**Status:** Done
**Status Note:** [2026-10-30, worktree feat-emotion-avatar-completion] `avatarForMessage` keys on `msg.actor_id` against per-actor `_emotionAvatarsByActor` + `_actorBaseAvatars` maps populated by `loadEmotionAvatars` (participants route now selects `actors.avatar_asset_id`); unknown-author messages keep the legacy flat-list walk. Pure lookup core extracted to zero-import `mood/emotion-variants.ts` (exact → neutral → first) shared by the FE resolver and the backend pipeline test. Unit coverage in `mood.test.ts` (8 pass, default suite): author-variant match, per-actor base fallback, direct-chat regression. Scoped: `bun test src/frontend/alpine/mood.test.ts` (8 pass), `bun run typecheck` + `typecheck:frontend` green.
**Scope:** Emotion-Avatar Completion
**Priority:** high
**Effort:** Medium
**Epic:** epic-emotion-avatar-message-binding
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

In group chats, resolve each assistant message's avatar from ITS author
actor's emotion-tagged avatars (per `message.emotion`), not the chat's
single current character, with per-actor fallback to that actor's base
avatar.

**Context:**

Epic: epic-emotion-avatar-message-binding (open work item: "Group chats:
resolve the avatar per speaking actor"). Resolution today flows through
`avatarForMessage` in `src/frontend/alpine/mood/avatars.ts` backed by
`src/frontend/alpine/actor-emotion-avatars.ts`, keyed to the chat's
current character. Group chats have multiple assistant actors; the
message-list render path and the read API (`src/chat/service/read.ts`)
must carry the author actor per message. Verify whether the messages
read API already exposes the author actor id per message before
designing, and record findings here.

**Finding (verified 2026-10-30):** `messages.actor_id` (notNull FK →
`actors.id`) is the per-message author actor id, and `listMessages`
(`src/chat/service/read.ts`) uses `selectAll()`, so the read API already
exposes it — no read-API change needed. The FE `Message` type
(`chat-types/messages.ts`) and the `message-list.html` render path pass
the full row through, so `avatarForMessage(msg)` can key on
`msg.actor_id` directly. Related: the avatars list endpoint serializes
camelCase `assetId` on the wire (probed), so the loader maps
`assetId ?? asset_id`.

**Approach**

- Confirm the per-message author actor id in the messages read API;
  thread it into the frontend resolver.

- `avatarForMessage` resolves against the author actor's emotion-tagged
  avatars, falling back to that actor's base avatar.

- Direct chats keep the existing single-character path unchanged.

**Acceptance Criteria:**

- [x] Group-chat assistant message renders its author actor's
  emotion-matching variant

- [x] Actor without emotion-tagged avatars falls back to that actor's
  base avatar

- [x] Direct chats unchanged (regression test)
- [x] Resolver unit tests for the per-actor path
