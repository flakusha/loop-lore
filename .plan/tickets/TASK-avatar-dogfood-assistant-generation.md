<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — Assistant Generation Wiring

**Summary:** Route assistant avatar requests through the existing image pipeline.
**Context:** Slice 1 of epic-avatar-dogfood (dogfood loop on PNG masters).
**Acceptance Criteria:** (see below)

**Status:** Done
**Priority:** High
**Effort:** Medium
**Epic:** epic-avatar-dogfood

## Summary

Let the in-app assistant turn an operator's avatar request ("generate a
portrait for Elara") into a real actor avatar: prompt → `/image`-equivalent
→ `POST /api/v1/generation/image` → `persistGeneratedImages` → avatar variant
bound to the actor. Reuses `single-generation.ts` persist path; no new
generation backend, no webp work.

## Acceptance Criteria

- [x] Assistant chat turn with an avatar request produces a generated image via the existing `/image` → `POST /api/v1/generation/image` path (no parallel pipeline) — new `/avatar` assistant command (`src/assistant/commands/avatar.ts`) rides the same `generate-image` frontend action; the frontend handler forwards `bindActorAvatar` (`src/frontend/alpine/chat-actions/dispatch.ts`). Pinned by `simple-commands.test.ts` describe `/avatar` and `chat-actions-dispatch.test.ts` "forwards bindActorAvatar…".
- [x] Generated image is persisted via `persistGeneratedImages` (`src/assets/service/persist-generated.ts`) and bound as an avatar variant on the target actor — new binding op `bindGeneratedActorAvatar` (`src/characters/services/avatar-service/generated.ts`) called from `handleImageGeneration` after persist; ownership gated pre-provider via `resolveActorAccess` (403 foreign / 404 missing, no generation paid). Pinned by `image-gen-route.test.ts` describe "bindActorAvatar (Avatar Dogfood slice 1)" and `avatar-service/generated.test.ts`.
- [x] Generation failures surface to the operator in chat; no partial avatar binding left behind — provider failures return the existing error envelope; a mid-bind failure unwinds every avatar row/link created by the call and answers 500 (pinned: `generated.test.ts` rollback test + route 500 test).
- [x] Unit/route tests: prompt→generation→persist→avatar-variant binding (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`) — see the suites above.

## Linked Epics

- `epic-avatar-dogfood.md`


git issue: 747ea17
