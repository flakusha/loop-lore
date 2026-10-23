<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — Assistant Generation Wiring

**Summary:** Route assistant avatar requests through the existing image pipeline.
**Context:** Slice 1 of epic-avatar-dogfood (dogfood loop on PNG masters).
**Acceptance Criteria:** (see below)

**Status:** Not Started
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

- [ ] Assistant chat turn with an avatar request produces a generated image via the existing `/image` → `POST /api/v1/generation/image` path (no parallel pipeline)
- [ ] Generated image is persisted via `persistGeneratedImages` (`src/assets/service/persist-generated.ts`) and bound as an avatar variant on the target actor (planned-new: actor-avatar binding op for generated variants)
- [ ] Generation failures surface to the operator in chat; no partial avatar binding left behind
- [ ] Unit/route tests: prompt→generation→persist→avatar-variant binding (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-avatar-dogfood.md`
