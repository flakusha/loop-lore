<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar render-target discriminator (bust portrait vs full-body portrait vs VN sprite)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Tags:** avatar
**Caveats:** TOCTOU: an avatar row's tag can change between selection and render — the render reads the asset id it was given and never re-resolves, so a mid-flight edit degrades to the fallback rather than rendering a mismatched asset. Security: none new; no endpoint is added by the discriminator itself. Authorization: a render target never widens which actors' assets a caller may see — the existing actor-scoped avatar queries are unchanged. Parallelism: two concurrent renders of the same actor must pick the same asset — the target filter is deterministic. Lock/unlock lifecycle: none. Partial failure: a missing target asset must degrade to the documented fallback, never throw and never blank the portrait. Rollback: removing the tag member makes the target unroutable, exactly as the framing precedent does — no schema change is involved. Stale state: an avatar tagged with a target that no longer has any asset must degrade, not error. Data races: none beyond deterministic selection. Idempotency: pure — the same actor plus the same requested target always resolves to the same asset. Observability: log the requested target and the chosen fallback rung when a degradation happens, so a missing-target bug is visible rather than silent.

**Summary:**

The chat surface renders a bust portrait and the VN surface renders a full-body
sprite of the same actor, and nothing in the data model distinguishes them. This
ticket adds one discriminator that says which render target an asset serves,
with a deterministic fallback when the requested target has no asset.

**Context:**

1. **No portrait-vs-full-body distinction exists.** `character_avatars` links an
   actor to an asset with `label`, `is_primary`, `sort_order`, JSON `tags` and
   `outfit_id` — `src/db/schema-character.ts:88-100` (`tags` at `:94`,
   `outfit_id` at `:99`). There is no render-target column and no
   render-target tag member: `AvatarTagType` is declared at
   `src/db/enums-character/avatar.ts:5-12` with `emotion`, `mood`, `action`,
   `location`, `time`, `outfit` — no target axis.

2. **The base portrait is a single column.** `actors.avatar_asset_id` is one
   nullable asset id at `src/db/schema-core.ts:413`; it is resolved into a
   synthetic base avatar at
   `src/characters/services/avatar-service/selection.ts:30-52`.

3. **`asset_transforms.context` is NOT a per-character variant row.** It is a
   TRANSFORM of ONE source asset: the interface is
   `src/db/schema-core.ts:252-256` (`asset_id` at `:254`, `context` at `:255`),
   and the enum is `TransformContext` at `src/db/enums-content.ts:53-62`
   (`default | avatar_circle | chat_bubble | card | gallery | sprite`) — a
   render CONTEXT for a transform, not a subject-framing or target class on a
   character's avatar.

4. **The VN surface renders one flat `<img>` per cast member.**
   `buildStageElement` at `src/frontend/vn/sprite-stage.ts:187-204` creates one
   portrait element holding a single image
   (`src/frontend/vn/portrait-manager.ts:79-86`).

5. **Two surfaces consume the same asset id with no discriminator between
   them.** The chat message bubble renders a single `<img class="avatar">`
   from the message's `avatar_asset_id` at
   `src/components/chat/message-list.html:117-126`; the VN stage renders the
   same actor's roster asset (`src/frontend/vn/sprite-stage.ts:200-201`).
   Nothing records which of the two an asset was authored for.

6. **The epic's framing discriminator is a DIFFERENT axis.** Framing answers
   "how is the subject framed within a shot"; the render target answers
   "which surface is this asset drawn on". The epic's rule for a new
   discriminator is JSON tag member FIRST, authoritative column LATER — see
   `.plan/epics/epic-reactive-actor-appearance.md:151-153` (phase 3): "Zero
   migration — `character_avatars.tags` is already a JSON column... A real
   column stays a **future task**."

7. **The epic's precedent for deferring the authoritative column.** The
   framing column is filed as a deliberately-deferred future task at
   `.plan/epics/epic-reactive-actor-appearance.md:277-280`
   (`TASK-avatar-framing-column-migration-future.md`).

8. **The wardrobe ladder's rung order must not change.** (outfit, emotion) ->
   (outfit, neutral) -> (default outfit, emotion) -> (base/outfitless,
   emotion) -> base portrait, at
   `src/characters/services/wardrobe/selection-ladder.ts:9-17`.

**Acceptance Criteria:**

- [ ] AC1: The render target is derivable per asset/avatar WITHOUT introducing a second competing convention: the mechanism is named (a JSON tag member on `character_avatars.tags`, matching the epic's framing rule) and its owner is named — the axis lives alongside `AvatarTagType` (`src/db/enums-character/avatar.ts:5-12`) and is scored by the existing tag loop in `src/characters/services/avatar-service/selection.ts:225-232`.
- [ ] AC2: Selection can request a specific render target and degrades DETERMINISTICALLY when that target has no asset — the documented fallback order (target match -> targetless/any-target variant -> base portrait) is written down in the module and pinned by a test.
- [ ] AC3: The chat surface and the VN surface each request their own target, and an actor with only a bust portrait STILL RENDERS on the VN surface (it falls back to the bust asset) — never a blank portrait.
- [ ] AC4: No authoritative column is added now: the discriminator ships as a JSON tag member only, and the authoritative-column work stays ONE clearly separated future task, matching the epic's framing precedent (`.plan/epics/epic-reactive-actor-appearance.md:277-280`).
- [ ] AC5: The fallback order and the missing-target degradation are unit-pinned: a test asserts the exact chosen asset for (a) an exact target hit, (b) a target miss falling to a targetless variant, and (c) a target miss with no variant at all falling to the base portrait.
- [ ] AC6: The documentation states WHERE the discriminator is read (the avatar selection context, alongside `emotion`/`outfit`) and that the wardrobe ladder's rung order (outfit, emotion) is unchanged (`src/characters/services/wardrobe/selection-ladder.ts:9-17`).
- [ ] AC7: The discriminator is distinct from the framing axis: a test asserts an asset carrying both values resolves by the target rule without either axis shadowing the other, and the framing axis remains owned by `TASK-avatar-framing-tag-member.md`.

**Notes / Evidence:**

- No portrait/full-body distinction: `src/db/schema-character.ts:88-100`
  (`tags` at `:94`, `outfit_id` at `:99`); the tag enum
  `src/db/enums-character/avatar.ts:5-12`
- The single base portrait column: `src/db/schema-core.ts:413`; its resolution
  `src/characters/services/avatar-service/selection.ts:30-52`
- `asset_transforms` is a transform of ONE source asset:
  `src/db/schema-core.ts:252-256`; the context enum
  `src/db/enums-content.ts:53-62`
- The VN surface, one flat `<img>` per cast member:
  `src/frontend/vn/sprite-stage.ts:187-204`; the single image
  `src/frontend/vn/portrait-manager.ts:79-86`
- The chat surface's single `<img class="avatar">`:
  `src/components/chat/message-list.html:117-126`; the VN surface's roster
  asset `src/frontend/vn/sprite-stage.ts:200-201`
- The epic's rule (JSON tag member first, authoritative column later):
  `.plan/epics/epic-reactive-actor-appearance.md:151-153`
- The epic's deferral precedent:
  `.plan/epics/epic-reactive-actor-appearance.md:277-280`
  (`TASK-avatar-framing-column-migration-future.md`)
- The companion framing-axis ticket (a different axis):
  `TASK-avatar-framing-tag-member.md`
- The existing tag-scoring loop a new member plugs into:
  `src/characters/services/avatar-service/selection.ts:225-232`;
  the tag lists at `:15` and `:18`
- The wardrobe ladder whose rung order is unchanged:
  `src/characters/services/wardrobe/selection-ladder.ts:9-17`
