<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN cast server producer

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** The inherited research left this UNVERIFIED because it never opened the message-serialization DTO; this ticket's premise was re-verified (see Notes) — `toVnMessage` is the only producer and it maps six fields, none of them `cast`. Security: `cast` is a cast roster embedded in a chat response; a caller must not be able to name an actor outside their chat. Authorization: every cast member must resolve to a participant the requesting user can already see. Rollback: omitting the field restores today's fallback. Stale state: a cast member removed from the chat after the fact must degrade to absent, not throw. Idempotency: pure projection. Observability: none.

**Summary:**

`msg.cast` and `emotionVariants` have **no server producer**, so multi-sprite
staging and per-member variant resolution are effectively dead code. Emit them.

**Context:**

The chain, verified end to end in the frontend:

1. `toVnMessage` (`src/frontend/alpine/chat-settings/vn.ts:22-33`) maps a chat
   message to the renderer's shape. It emits exactly six fields: `id`, `role`,
   `name`, `content`, `thinking`, `attachments`. **`cast` and `emotionVariants`
   are never set** — and it is the only place a `VnMessage` is built from a
   chat message (`src/frontend/alpine/chat-settings/vn.ts:99` maps every message
   through it).
2. `msgToScene` (`src/frontend/vn/scene-renderer/render.ts:53-55`) falls back:
   `cast: msg.cast ?? (speakerId === null ? [] : [{ characterId: speakerId,
   name: displayName, avatarAssetId: msg.avatar_asset_id }])`. So a scene
   carries **at most one** cast member, with **no `emotionVariants`**.
3. `buildStageElement` (`src/frontend/vn/sprite-stage.ts:190-200`) prefers
   `entry.emotionVariants[emotion]` and falls back to `entry.avatarAssetId`.
   With `emotionVariants` always undefined, **the fallback always wins**.
4. Multi-sprite staging only engages with **two or more** cast members and a
   non-overlay layout (`src/frontend/vn/scene-renderer/stage.ts:38-39`). A
   single-character scene silently drops to the single-portrait path
   (`src/frontend/vn/scene-renderer/render-scene.ts:59-72`), which has no
   variant support at all.

So the entire sprite-variant path is inert in the default single-character case.

**Where the data must come from.** The chat already knows its participants —
`resolveChatKnownEntityNames`
(`src/generation/auto-gen/resolve-known-names.ts:36-68`) reads
`chat_participants` joined to `actors.display_name`. `chats.gm_config.cast`
(`src/chat/types/variants.ts:54`, default `[]` at `:180`) is already a
**cast of actor ids** maintained by the GM config — that is the natural source
for membership, resolved to display names and avatar asset ids.

**`emotionVariants` needs the avatar rows.** For each cast member, look up
`character_avatars` for that actor and build
`{ [tags.emotion]: asset_id }` — the same shape
`SpriteRosterEntry.emotionVariants` declares
(`src/frontend/vn/sprite-stage.ts:37-38`, `Record<string, string>`, compared
case-insensitively at `:131-141`). This does **not** require the outfit axis;
that comes from `messages.outfit_id` /
`TASK-chat-avatar-resolver-outfit-aware.md` separately.

**This ticket is a prerequisite for, not a replacement of, the interaction
limitation.** Multi-sprite staging renders several characters *on stage
together*; it does not render two characters **interacting**. That limitation is
accepted in the epic's Non-Goals.

**Acceptance Criteria:**

- [ ] The server produces a cast for VN mode messages, with each member
      carrying `characterId`, `name`, and `avatarAssetId`
- [ ] Each member carries `emotionVariants` built from that actor's
      `character_avatars` rows, keyed by `tags.emotion`
- [ ] `toVnMessage` (`src/frontend/alpine/chat-settings/vn.ts:22-33`) carries the
      field through, and the `VnMessage` type
      (`src/frontend/vn/scene-renderer/types.ts:32-51`) reflects it
- [ ] Every cast member resolves to an actor the requesting user can already
      see; a non-participant is never emitted
- [ ] A cast member with no `character_avatars` rows degrades to the base
      avatar, never to undefined and never to a throw
- [ ] A two-member cast with non-overlay layout renders two sprites via
      `buildStageElement` (`src/frontend/vn/sprite-stage.ts:190-200`), pinned by
      a test that fails today
- [ ] A single-member cast behaves exactly as today
- [ ] The existing fallback at `src/frontend/vn/scene-renderer/render.ts:53-55`
      still applies when the server sends no cast
- [ ] Tests pass; `bun run typecheck`, `bun run typecheck:frontend`, and
      `bun run lint` clean

**Notes / Evidence:**

- **Premise re-verified** (the inherited research left this UNVERIFIED because
  it never opened the DTO builder): `toVnMessage`
  `src/frontend/alpine/chat-settings/vn.ts:22-33` is the only chat-message →
  `VnMessage` mapping and sets no `cast`; it is applied to every message at
  `src/frontend/alpine/chat-settings/vn.ts:99`
- The cast fallback: `src/frontend/vn/scene-renderer/render.ts:53-55`
- `VnMessage` shape: `src/frontend/vn/scene-renderer/types.ts:32-51`
  (`cast` at `:41`)
- Roster entry and `emotionVariants`:
  `src/frontend/vn/sprite-stage.ts:37-40`
- Variant resolution + base fallback: `src/frontend/vn/sprite-stage.ts:131-141`
- Sprite element build: `src/frontend/vn/sprite-stage.ts:190-200`
- Stage gating (needs >= 2 cast, non-overlay):
  `src/frontend/vn/scene-renderer/stage.ts:38-39`
- Single-portrait fallback path:
  `src/frontend/vn/scene-renderer/render-scene.ts:59-72`
- Cast of actor ids already in chat config: `src/chat/types/variants.ts:54`,
  default `[]` at `:180`
- Participant resolution: `src/generation/auto-gen/resolve-known-names.ts:36-68`
- Preload path that must also see the variants:
  `src/frontend/vn/scene-renderer/render.ts:22-29` and `:76-83`
- Existing tests: `src/frontend/vn/sprite-stage.test.ts:62-90`,
  `src/frontend/vn/scene-renderer/stage.test.ts`,
  `src/frontend/vn/scene-renderer/render.test.ts`