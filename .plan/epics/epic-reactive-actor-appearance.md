<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Reactive Actor Appearance

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** drafted 2026-10-18 (planning branch `character-outfit-wardrobe`) as the **successor** to `epic-wardrobe-avatar-variants.md`, incorporating four user decisions (identity drift accepted + strategy selector; framing discriminator as a JSON tag member; wardrobe Non-Goals deliberately reopened; multi-actor attribution built now).
**Priority:** high
**Effort:** Large
**Type:** Feature Epic
**Tags:** avatar, wardrobe, outfit, pose, framing, reactive, narrative-extraction, hooks, per-message, selection, identity-lock, img2img

## Summary

The wardrobe backbone shipped (`epic-wardrobe-avatar-variants.md`, `Status: Done`,
closed 2026-10-09) but its read path is **dead**: nothing in the chat render path
resolves an outfit, and nothing infers appearance from prose. This epic makes an
actor's rendered appearance a function of what the assistant just narrated —
emotion, outfit, pose, framing, held item — and, where a new variant must be
**drawn**, adds the identity machinery (`seed`, `negativePrompt`, an img2img
init-image reference) that the predecessor epic promised but never built.

**This epic is a successor, not an amendment.** `epic-wardrobe-avatar-variants.md`
stays `Done` and untouched. This file deliberately reopens two of its Non-Goals
(see Non-Goals).

## Motivation

Seven defects exist today, independent of any new feature:

1. **The outfit axis never reaches render.** `avatarForMessage`
   (`src/frontend/alpine/mood/avatars.ts:155-168`) takes a message shaped
   `{ role?, emotion? }` — no outfit input exists in the signature. The ladder
   runs only inside `selectAvatar`
   (`src/characters/services/avatar-service/selection.ts:138-153`), and grep for
   `selectAvatar` across `src/frontend` returns nothing.
2. **The chat-header outfit switcher writes into the void.**
   `src/frontend/alpine/chat-outfit-switcher.ts:109-118` PUTs an override that
   `src/characters/services/wardrobe/resolve.ts:160-189` can read, but nothing
   joins resolution to render.
3. **Nothing infers appearance from prose.** Outfit resolves from *state* only —
   chat override > location rule > equipped loadout > default
   (`src/characters/services/wardrobe/resolve.ts:164-188`). The predecessor's
   story/GM work item shipped prompt-side narration only
   (`src/assistant/prompt-outfit.ts:59-68`), and its own file records "no
   equip-time writes yet" (`epic-wardrobe-avatar-variants.md:104`).
4. **No identity lock.** `single-generation.ts:86` calls
   `generateImages(opts.sdConfig, { prompt, n: 1, outputFormat: "png" })` — no
   `seed`, no `negativePrompt`, no init image. The promised strategy ("edit-model
   img2img from base avatar where stable ... else seed-locked txt2img",
   `epic-wardrobe-avatar-variants.md:66-70`) does not exist in code.
5. **The identity anchor is degenerate and self-reinforcing.**
   `alt_text` is written as the literal string `Emotion avatar: <emotion>`
   (`single-generation.ts:106`) and read back as the next round's prompt anchor
   (`src/characters/services/emotion-avatar-fallback.ts:78-91`) — so a batch
   writes eight anchors that all say "Emotion avatar: ...".
6. **No framing discriminator, no pose axis.** `character_avatars` carries only
   `tags` (JSON) and `outfit_id` (`src/db/schema-character.ts:88-100`); the
   `assets` table has `width`/`height` and nothing else intrinsic
   (`src/db/schema-content.ts:46-47`). `AvatarTagType.Action` is declared and
   scored (`src/db/enums-character/avatar.ts:8`,
   `selection.ts:241-243`) but has no production producer.
7. **The VN cast path is inert.** `msg.cast` and `emotionVariants` have no
   server-side producer; `msgToScene` falls back to a single-speaker cast
   (`src/frontend/vn/scene-renderer/render.ts:53-55`), and `applyStageDirectives`
   handles only `enter`/`exit` — the derived `swap` arm is dropped
   (`src/frontend/vn/stage-directives.ts:72-77`).

Defects 1–3 are invisible to the user; 4–7 make any reactive *drawing* produce
a different person in a different body.

## Current State

- **Per-message appearance precedent works end to end.** `messages.emotion`
  (`src/db/schema-core.ts:778`) is written at
  `src/generation/auto-gen/store-message.ts:161` and
  `src/generation/auto-gen/story-store.ts:170`, and read by `avatarForMessage`.
  `messages.outfit_id` mirrors it exactly — a migration plus two write sites.
- **The change-gate seam is live with exactly one production caller.**
  `requestOutfitChange` (`src/characters/services/wardrobe/change-gate.ts:71-79`)
  from `src/routes/wardrobe-overrides.ts:100-106`.
- **Hooks are live**, run in registration order, none short-circuit
  (`src/generation/hooks/registry.ts:47-78`); defaults registered at
  `src/generation/hooks/registry.ts:86-92`, called from `src/server/start.ts:72`.
- **`ImageGenOptions` has no reference-image field**
  (`src/generation/image-engine/types.ts:6-25`), and the ComfyUI path
  substitutes only prompt/negativePrompt/width/height/steps/cfg/sampler/seed
  (`src/generation/image-engine/comfyui.ts:44-53`).
- **A live img2img workflow template already exists**
  (`configs/workflows/img2img.json:25-31` wires a `LoadImage` node to
  `{{input_image}}`), and `uploadImageToComfy`
  (`src/generation/providers/comfyui-upload.ts:21-48`) already POSTs bytes to
  `/upload/image`. Nothing in the *generation* path calls either.
- **A live `src/image-edit/` subsystem accepts an uploaded `input_image`** at
  `POST /api/v1/image-edit/run` (`src/image-edit/routes.ts:64-74`), with an
  `img2img` template (`src/image-edit/templates/builtin/img2img.ts`) — but it is
  not reachable from `generateImages` and shares none of the emotion-avatar job
  plumbing.
- **Next free migration number is 065** — highest present is
  `src/db/migrations/064_vn_choice_selections.ts`.
- **Inpaint requires a hand-uploaded mask**
  (`src/image-edit/templates/builtin/inpaint.ts:39-46`); a repo-wide grep for
  mask-derivation terms across `src/` returns one unrelated test string
  (`src/tui/harness/display.test.ts:165`). SAM3 is `Not Started`
  (`.plan/epics/epic-sam3-segmentation-integration.md:8`) with its own ComfyUI
  prerequisites open (`:50-55`).

## Architecture

Seven seams, in dependency order. Phases 1–5 are shippable with no new image
machinery; phase 6 is the identity work; phase 7 is the reopened ground-up scene
direction.

### Phase 1 — make the shipped read path live

- **`messages.outfit_id`** — migration `065` plus a write beside every existing
  `emotion` write. Cheapest architectural decision in the feature: it makes
  appearance rendering read-side and symmetric with emotion.
- **Outfit-aware avatar resolution** — give `avatarForMessage` an outfit input,
  or resolve server-side via `selectAvatar`. One ladder, one owner of the
  ordering. **P0: without it every other item here is invisible.**
- **VN cast producer** — emit `msg.cast` and per-member `emotionVariants` from
  the server so multi-sprite staging and `resolveSpriteUrl` stop being dead
  code.
- **`swap` directive arm** — implement the missing branch in
  `applyStageDirectives` and widen the payload past `emotion`
  (`stage-directives.ts:28`).

### Phase 2 — narrative extraction from the assistant reply

- **Hook (`llm.content`) → change gate.** A new `HookHandler` reads the
  **assistant reply**, extracts candidate appearance changes, resolves the
  target actor by member-set name validation (the
  `src/regex/stage2-llm.ts:197-202` pattern over
  `resolveChatKnownEntityNames`,
  `src/generation/auto-gen/resolve-known-names.ts:36-68`), and routes each
  through `requestOutfitChange` with `initiator: "gm"`. Registered in
  `initDefaultHooks` **and** in the `enabledEventTypes` construction at
  `src/generation/auto-gen/content-hooks.ts:189-193`, or the `eventTypes`
  filter (`registry.ts:54-58`) silently skips it whenever targeting is on.
  Requires a fifth `config.hooks.enableOutfitHooks` flag
  (`src/config/schema/hooks.ts:8-17`, defaults at
  `src/config/schema-class/hooks.ts:7-13`). Must be exception-safe: the story/GM
  path fails the turn closed on a hook throw
  (`src/generation/auto-gen/story-store.ts:129-137`).

### Phase 3 — the reopened axes

- **Framing discriminator** as a new `AvatarTagType.Framing` member. Zero
  migration — `character_avatars.tags` is already a JSON column
  (`src/db/schema-character.ts:94`). A real column stays a **future task**.
- **Pose axis, reused via `AvatarTagType.Action`** — not a seventh member.
  `Action` is declared (`avatar.ts:8`), scored under `action_first`
  (`selection.ts:241-243`), has a default weight (`selection.ts:169-174`) and a
  context field (`src/characters/services/avatar-service/types.ts:56`), and has
  **zero production producers**. Adding `Pose` would create a second unwired
  axis and a second rule branch.
- **Held item as a whole-outfit variant axis** — curated `wardrobe_items.tags`
  (`hands-free`, `battle-wielding`), NOT layered compositing. This is the
  reopened layering Non-Goal, answered on the reachable side.
- **Equip-time bind write side** — `equip()` / `unequip()`
  (`src/services/actor-items.ts:155-217`) have no wardrobe side effects today;
  bind through `bindWardrobeItemInstance`
  (`src/characters/services/wardrobe/bindings.ts:21-62`). Completes the slot
  left open by the predecessor's deferred work item
  (`epic-wardrobe-avatar-variants.md:101-104`).

### Phase 4 — identity and the edit/generation strategy selector

- **Cheap identity lock first**: pass `seed` and `negativePrompt` at
  `single-generation.ts:86` (both already exist on `ImageGenOptions`,
  `types.ts:16-17`; `negativePrompt` is threaded from the routes at
  `src/validation/schemas/wardrobe.ts:51-56` → `generation.ts:152` and then
  dropped), and stop the degenerate `"Emotion avatar: X"` anchor.
- **img2img init-image plumbing** — add an init-image field to
  `ImageGenOptions`, upload the base avatar via the existing
  `uploadImageToComfy`, and pass the stored filename as `input_image` into the
  existing `configs/workflows/img2img.json`. Blocked on
  `epic-comfyui-plugin`'s open prerequisites (numeric parameterization,
  node-id allocation, parameter validation —
  `.plan/epics/epic-sam3-segmentation-integration.md:50-55` names the same
  three).
- **Strategy selector** — an explicit operator/config-level strategy with
  edit-preferred / generation-fallback semantics: use `edit` when it is
  available **and** selected; otherwise fall back to `generation` when
  generation is selected or is the only option available. This is a decision
  surface that must exist *before* the img2img rung, so its fallback path is
  exercisable from day one.

### Phase 5 — ground-up scene generation with background

- **Full ground-up scene generation including the background**, as the escape
  hatch for interactions that no per-actor variant can express (a user answer:
  display mode currently cannot show two characters interacting; generate the
  whole scene instead of compositing sprites). Readiness is assessed honestly
  in Rejected Alternatives — it needs **no mask**, but it does need the
  identity machinery from phase 4 and has no scene-composition prompt slot
  today.

## Work Items

- [ ] **Chat avatar resolver outfit-aware (P0)** — give `avatarForMessage`
      (`src/frontend/alpine/mood/avatars.ts:155-168`) an outfit input, or resolve
      server-side via `selectAvatar`. One ladder, one owner of the ordering
      → `TASK-chat-avatar-resolver-outfit-aware.md`
- [ ] **`messages.outfit_id` column** — migration `065` plus a write beside each
      of the two production `messages.emotion` writes
      → `TASK-messages-outfit-id-column.md`
- [ ] **Outfit narrative extractor — regex prefilter** — new
      `src/regex/outfit-events.ts`, narrative-shaped groups modelled on
      `src/regex/story-events.ts:73-82`; a fresh module inherits none of the
      `change_outfit` (0.9) vs `add_accessory` (0.7) collision in
      `src/regex/image-edit.ts:103-119`
      → `TASK-outfit-narrative-extractor-regex-prefilter.md`
- [ ] **Outfit-change AUX task + TypeBox schema** — new
      `AuxTaskName: "outfit-change"`
      (`src/aux-pipeline/types.ts:13-26`) returning
      `{ changes: [{ actorName, verb, garment, confidence }] }`
      → `TASK-outfit-change-aux-task-and-typebox-schema.md`
- [ ] **Multi-actor member-set name resolution** — resolve the extracted
      `actorName` against `resolveChatKnownEntityNames`
      (`src/generation/auto-gen/resolve-known-names.ts:36-68`) with the
      rejection contract of `src/regex/stage2-llm.ts:197-202`
      → `TASK-outfit-change-multi-actor-name-resolution.md`
- [ ] **Outfit-change hook** — `HookHandler` on `llm.content`, registered in
      `initDefaultHooks` (`src/generation/hooks/registry.ts:86-92`) **and** in
      the `enabledEventTypes` construction
      (`src/generation/auto-gen/content-hooks.ts:189-193`); exception-safe per
      `src/generation/auto-gen/story-store.ts:129-137`; reads the assistant
      reply only
      → `TASK-outfit-change-hook.md`
- [ ] **Change-gate initiator mapping** — extracted narration routes with
      `initiator: "gm"`; `npc` bypasses the gate unconditionally
      (`src/characters/services/wardrobe/change-gate.ts:75-77`) and the existing
      tests bless the wrong choice
      → `TASK-outfit-change-gate-initiator-mapping.md`
- [ ] **Framing discriminator as an `AvatarTagType` member** — JSON tag, zero
      migration, with a ladder rung and a resolution input
      → `TASK-avatar-framing-tag-member.md`
- [ ] **Pose axis via `AvatarTagType.Action`** — reuse the declared, scored,
      producer-less `action` axis rather than adding a seventh member
      → `TASK-avatar-pose-via-action-tag.md`
- [ ] **`swap` directive arm + widened payload** — implement the branch
      `applyStageDirectives` drops (`src/frontend/vn/stage-directives.ts:72-77`)
      and widen the directive beyond `emotion` (`:28`)
      → `TASK-stage-directives-swap-arm.md`
- [ ] **VN cast server producer** — emit `msg.cast` and `emotionVariants`;
      today they have no producer and `msgToScene` synthesizes a single speaker
      (`src/frontend/vn/scene-renderer/render.ts:53-55`)
      → `TASK-vn-cast-server-producer.md`
- [ ] **Identity lock: seed + negativePrompt + non-degenerate anchor** — pass
      both fields at `single-generation.ts:86`; stop writing
      `alt_text: "Emotion avatar: <emotion>"` (`:106`) into the prompt anchor
      read at `emotion-avatar-fallback.ts:78-91`
      → `TASK-identity-lock-seed-negative-prompt-and-anchor.md`
- [ ] **img2img init-image plumbing (prerequisite)** — add an init-image field
      to `ImageGenOptions` (`src/generation/image-engine/types.ts:6-25`), upload
      via the existing `uploadImageToComfy`
      (`src/generation/providers/comfyui-upload.ts:21-48`), bind it to the
      existing `configs/workflows/img2img.json:25-31`
      → `TASK-img2img-init-image-plumbing.md`
- [ ] **Edit-vs-generation strategy selector** — explicit config-level strategy,
      edit-preferred with generation fallback, safe to ship before the edit rung
      exists → `TASK-appearance-edit-vs-generation-strategy-selector.md`
- [ ] **Equip binds outfit (write side)** — `equip()` / `unequip()`
      (`src/services/actor-items.ts:155-217`) bind and unbind through
      `bindWardrobeItemInstance`; closes the slot the predecessor deferred
      → `TASK-equip-binds-outfit-write-side.md`
- [ ] **Held item as a whole-outfit variant axis** — curated `tags`, explicitly
      not layered compositing
      → `TASK-held-item-whole-outfit-variant-axis.md`
- [ ] **Ground-up scene generation with background** — the escape hatch for
      interactions no variant can express; readiness assessed, not assumed
      → `TASK-ground-up-scene-generation-with-background.md`
- [ ] **Future: framing as a migration column** — authoritative
      `character_avatars.framing` superseding the JSON tag; deliberately
      deferred, not now
      → `TASK-avatar-framing-column-migration-future.md`

## Non-Goals

### Deliberately reopened from `epic-wardrobe-avatar-variants.md:124-129`

That epic shipped `Status: Done` and is **not** amended by this file. These two
Non-Goals are reopened by this successor epic, on the user's explicit decision
(2026-10-18), with these reasons:

- **Per-pose / skeletal variation** — reopened as a **variant axis**, not as
  skeletal rig or pose interpolation. This epic does not add a 7th tag member;
  it produces a value for the existing `AvatarTagType.Action` axis
  (`src/db/enums-character/avatar.ts:8`) and lets the existing `action_first`
  rule (`selection.ts:241-243`) consume it. Reason: `Action` is already
  declared, scored, weighted, and threaded through context — it has only a
  producer missing. Adding `Pose` instead would create a second unwired axis
  and a second rule branch for no gain. **What stays barred:** true skeletal
  variation, bone-driven deformation, pose interpolation between keyframes.
- **Item-level appearance compositing** — reopened **only on the curated
  whole-outfit axis**: an outfit variant that *depicts* a held item
  (`battle-wielding`, `hands-free`) is a normal wardrobe row and ships. True
  per-item layer compositing (rendering the cloak separately from the tunic,
  a mask per garment, occlusion ordering) **remains out of scope and is
  blocked**, not merely deferred: inpaint requires a hand-uploaded mask
  (`src/image-edit/templates/builtin/inpaint.ts:39-46`), no mask-derivation code
  exists anywhere in `src/`, and SAM3 is `Not Started` with its own ComfyUI
  prerequisites open (`.plan/epics/epic-sam3-segmentation-integration.md:8,50-55`).

### Still closed from the predecessor

- **Cross-character outfit sharing beyond world-scope template items** — carried
  forward verbatim. Nothing in this epic introduces a shared wardrobe.

### This epic's own non-goals

- **No extraction from the user prompt.** `detectAvatarChangeIntent` was removed
  for exactly this reason (`src/generation/auto-gen/prepare-generation.ts:13-17`:
  it "ran on the user's input and biased the LLM toward the user's mood ... the
  avatar should reflect the assistant's reply, not the user's prompt"). Re-attaching
  it re-litigates a settled decision.
- **Display modes cannot yet show character interactions.** Accepted as a
  documented limitation. VN mode and other display modes render one actor per
  scene; `msgToScene` synthesizes a single-speaker cast
  (`src/frontend/vn/scene-renderer/render.ts:53-55`). The workaround direction is
  ground-up scene generation (phase 5), which is its own ticket and honestly
  scoped there.
- **No per-message job queue.** Resolution is synchronous with message render,
  mirroring `messages.emotion`. The emotion-avatar job store is in-memory,
  server-lifetime only (`src/characters/services/emotion-avatar-service/index.ts:15-16`),
  and per-message generation would be a job storm against rate-limit policies
  shaped for operator batches.
- **No duplicate convention for framing.** Ship the JSON tag member now; the
  migration column is a separate future task that supersedes it. Building both
  is the duplicate-convention failure mode.
- **No accepted-and-ignored request fields.** Do not copy the
  `RegenerateEmotionAvatarsBody.seedStrategy` pattern
  (`src/validation/schemas/emotion-avatars.ts:19-29`) — an endpoint parameter
  documented in the schema and silently unused.

## Acceptance Criteria

- An assistant reply containing a narration-shaped outfit change (e.g. "Mira
  shed her cloak") results in `messages.outfit_id` being non-null for that
  message, with no manual per-message choice
- The chat-header outfit override
  (`src/frontend/alpine/chat-outfit-switcher.ts:109-118`) visibly changes the
  rendered avatar — the switcher stops writing into the void
- A message with `outfit_id = null` renders exactly as today (zero-migration
  surprise; emotion-only characters keep working)
- Selection order is deterministic and unit-pinned, mirroring the shipped
  ladder: (outfit, emotion) → (outfit, neutral) → (default, emotion) → base
  (`src/characters/services/wardrobe/selection-ladder.ts:9-17`)
- An extracted change is reviewed by the change gate, never bypassed; a test
  asserts extracted narration routes with `initiator: "gm"`, not `"npc"`
- In a multi-actor chat, an extracted change is attributed to the **named**
  actor, not the speaker; an unresolvable name is rejected, not guessed
- A hook throw on the story/GM path does not lose the turn
  (`src/generation/auto-gen/story-store.ts:129-137`)
- With the strategy selector set to `edit` and no edit capability available, the
  call falls back to `generation` rather than failing or silently no-oping
- `negativePrompt` set through the outfit-generation routes has an observable
  effect; `seed` is passed to `generateImages`
- A regenerated variant's `alt_text` no longer contains the literal
  "Emotion avatar:" prefix, so it cannot be re-read as a degenerate prompt
  anchor
- A VN scene with two named cast members renders two sprites with per-member
  emotion variants, from server-produced data
- Tests pass; `bun run typecheck`, `bun run typecheck:frontend`, and `bun run
  lint` clean

## Rejected Alternatives

**Amending `epic-wardrobe-avatar-variants.md` in place.** Rejected on the user's
explicit instruction. The epic is `Status: Done`, all eight work items checked
(`epic-wardrobe-avatar-variants.md:77-104`), closed 2026-10-09. Editing a closed
epic's Non-Goals erases the record of what was agreed and shipped; a successor
epic with its own Non-Goals section is the auditable form of the same decision.

**A real migration column for framing, now.** Rejected in favour of a JSON
`AvatarTagType` member. `character_avatars.tags` is already JSON
(`src/db/schema-character.ts:94`), so the discriminator costs zero migration;
the authoritative column is a future task that supersedes the tag rather than
coexisting with it.

**A seventh `AvatarTagType.Pose` member.** Rejected. `Action` is declared,
scored under `action_first`, present in `AvatarSelectionContext`, and has zero
production producers. A second axis adds a second rule branch and a second
unwired member to fix the same problem.

**A migration-column framing change without a tag.** Rejected because the tag is
what makes the axis reachable now; a column alone cannot be populated by the
generation path that this epic builds.

**Item-level compositing as the primary answer to held items.** Rejected on
evidence: it needs mask derivation that does not exist. The curated
whole-outfit variant axis satisfies the same user-visible goal ("portrait
holding the item is replaced by the default portrait, outfit unchanged") as pure
variant selection.

**Reaching for `src/image-edit/` instead of new generation plumbing.** Rejected
for this epic. That subsystem is live and accepts an uploaded `input_image`
(`src/image-edit/routes.ts:64-74`), but it is a separate job/asset path that
does not share the emotion-avatar plumbing and is not reachable from
`generateImages`. Wiring it would mean two generation subsystems rather than
one.

**Per-pose skeletal variation proper (bones, interpolation).** Rejected as
distinct from the reopened tag axis. No pose estimation, no skeleton, no keyframe
system exists anywhere in `src/`; that is a rendering-pipeline project, not an
avatar-selection one.

### Ground-up scene generation — honest readiness

The user named this as the workaround for display modes not being able to show
character interactions. It is **more reachable than inpainting** and **less
reachable than variant selection**, and the difference is worth stating plainly:

| Requirement | Ground-up scene generation | Inpaint / item compositing |
|---|---|---|
| Mask | **Not needed** — everything is generated at once | **Required, hand-uploaded** (`inpaint.ts:39-46`) |
| SAM3 | Not needed | Not started (`.plan/epics/epic-sam3-segmentation-integration.md:8`) |
| Identity lock | **Required** — with no reference image the result is a fresh sample; without an init image this is worse than sprite selection, not better | Required |
| Scene prompt composition | **Does not exist today** — the prompt path composes identity-anchor + outfit-descriptor + emotion-descriptor (`single-generation.ts:37-76`), with no background or multi-actor slot | n/a |
| Multi-actor composition | **Does not exist today** — no prompt slot can express "two named characters interacting" | n/a |

So the blocker is **not** a mask and **not** SAM3; it is that this feature needs
two prompt slots that do not exist (background, multi-actor staging) *and* the
identity machinery from phase 4. It is genuinely reachable once phase 4 lands,
and it is scoped as its own ticket with its own honest assessment rather than
folded into the identity work.

## Related

- `epic-wardrobe-avatar-variants.md` — the shipped predecessor; source of the
  reopened Non-Goals, not modified by this epic
- `epic-emotion-avatar-message-binding.md` — the `messages.emotion` precedent
  `messages.outfit_id` mirrors
- `epic-avatar-regeneration-control.md` — operator-triggered regeneration
- `epic-immersion-consistency-gate.md` — the gate `change-gate.ts` is an
  injectable seam for; this epic is its first non-test narrative caller
- `epic-comfyui-plugin.md` — the img2img init-image prerequisite's owner
- `epic-sam3-segmentation-integration.md` — why item-level compositing stays
  blocked
- `epic-avatar-alpha-vn-layering.md` — the alpha/sprite pipeline a framing axis
  must eventually feed
- `epic-aux-enrichment-pipeline.md` — the shared AUX runner the outfit-change
  AUX task routes through