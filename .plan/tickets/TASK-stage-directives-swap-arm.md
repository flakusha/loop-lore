<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: `swap` stage-directive arm + widened payload

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** The module header currently documents `swap` as intentionally roster-neutral (`src/frontend/vn/stage-directives.ts:14-16`); implementing the arm changes that documented contract, so the header must be updated in the same change. Collision risk: low — no existing consumer depends on `applyStageDirectives` being a no-op for `swap`. Security: none. Authorization: none. Rollback: reverting restores the current behaviour. Stale state: a `swap` for a character not in the roster is already a no-op by contract and must stay one. Idempotency: applying the same directive twice is a no-op. Observability: none.

**Summary:**

`deriveStageDirectives` emits a `swap` directive that
`applyStageDirectives` silently drops. Implement the arm, and widen the
directive payload beyond `emotion` so an outfit or action swap is expressible.

**Context:**

Verified in one file:

- **Derived:** `src/frontend/vn/stage-directives.ts:55-60` pushes
  `{ kind: "swap", characterId: next.speakerId, emotion: next.emotion }`
  whenever the speaker or their emotion changed between scenes.
- **Dropped:** `applyStageDirectives`
  (`src/frontend/vn/stage-directives.ts:72-77`) handles only `enter` and
  `exit`. There is no `swap` branch.
- **Documented as intentional:** the module header at `:14-16` says *"`swap`
  never mutates the roster — expression resolution happens at render via
  `resolveSpriteUrl` with base-sprite fallback."* So today `swap` is a derived
  no-op by design, not a bug.

**Why that design stopped being sufficient.** Expression resolution at render
works only if `SpriteRosterEntry.emotionVariants` is populated — and it is not.
`resolveSpriteUrl` (`src/frontend/vn/sprite-stage.ts:131-141`) prefers
`entry.emotionVariants[emotion]` and falls back to the base sprite. `msgToScene`
(`src/frontend/vn/scene-renderer/render.ts:53-55`) synthesizes a cast with **no**
`emotionVariants` and only the speaker's `avatarAssetId`. So the fallback always
wins. The "expression resolution happens at render" claim depends on a server
producer that does not exist —
`TASK-vn-cast-server-producer.md` closes that gap, and this ticket closes the
directive gap.

**The payload is emotion-only.** The `StageDirective` union
(`src/frontend/vn/stage-directives.ts:25-28`) is:

```ts
| { kind: "enter"; characterId: string }
| { kind: "exit"; characterId: string }
| { kind: "swap"; characterId: string; emotion: string }
```

An outfit or action swap is not expressible. Widening means adding fields to the
`swap` member (e.g. `outfitId?: string`, `action?: string`) — the trigger
condition at `:55-60` must widen in step, or the directive will be derived for a
change it cannot carry.

**Design note.** `applyStageDirectives` mutates a `SpriteRoster` through
`setSpriteVisibility` (`src/frontend/vn/sprite-stage.ts`). An `action`/`outfit`
swap has no roster slot today, because `SpriteRosterEntry`
(`src/frontend/vn/sprite-stage.ts:37-40`) carries `avatarAssetId`,
`emotionVariants`, and `visible`. This ticket's scope is the **emotion swap arm
plus the payload widening**; making a non-emotion swap do something at apply time
depends on the roster gaining those fields, which is the cast producer's job.

**Acceptance Criteria:**

- [ ] `applyStageDirectives` handles the `swap` arm and no longer drops it
- [ ] A `swap` for a `characterId` not in the roster remains a no-op
- [ ] The `StageDirective` `swap` member carries at least `emotion` plus
      optional `outfitId` and `action` fields
- [ ] The derive condition at `src/frontend/vn/stage-directives.ts:55-60` fires
      when a widened field changes, not only on emotion
- [ ] The module header (`:14-16`) is updated to describe the implemented
      behaviour; the stale "never mutates the roster" claim for `swap` is gone
- [ ] Unit tests cover: swap applied, swap for an unknown id ignored, enter and
      exit unchanged, and a widened field triggering a swap
- [ ] `bun run typecheck:frontend` and `bun run lint` clean

**Notes / Evidence:**

- Directive union: `src/frontend/vn/stage-directives.ts:25-28`
- Derivation of `swap`: `src/frontend/vn/stage-directives.ts:43-63` (specifically
  `:55-60`)
- The dropped arm: `src/frontend/vn/stage-directives.ts:72-77`
- The header documenting the gap: `src/frontend/vn/stage-directives.ts:14-16`
  (and the inputs it names at `:8-13`)
- Render-time resolution the header relies on:
  `src/frontend/vn/sprite-stage.ts:131-141` (`resolveSpriteUrl`)
- Roster entry shape: `src/frontend/vn/sprite-stage.ts:37-40`
- Cast with no `emotionVariants`: `src/frontend/vn/scene-renderer/render.ts:53-55`
- Stage entry type mirroring the roster: `src/frontend/vn/scene-renderer/stage.ts:28-34`
- Existing tests to extend: `src/frontend/vn/stage-directives.test.ts`