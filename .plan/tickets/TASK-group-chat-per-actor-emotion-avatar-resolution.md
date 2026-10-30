<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Group-chat per-actor emotion-avatar resolution

**Status:** In Progress
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

**Approach**

- Confirm the per-message author actor id in the messages read API;
  thread it into the frontend resolver.

- `avatarForMessage` resolves against the author actor's emotion-tagged
  avatars, falling back to that actor's base avatar.

- Direct chats keep the existing single-character path unchanged.

**Acceptance Criteria:**

- [ ] Group-chat assistant message renders its author actor's
  emotion-matching variant

- [ ] Actor without emotion-tagged avatars falls back to that actor's
  base avatar

- [ ] Direct chats unchanged (regression test)
- [ ] Resolver unit tests for the per-actor path
