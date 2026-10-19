<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Ground-up scene generation with background

**Status:** Blocked
**Priority:** low
**Effort:** Large
**Epic:** epic-reactive-actor-appearance
**Caveats:** **Blocked on `TASK-img2img-init-image-plumbing.md`** — without a reference image this produces a *different person in a different place*, which is strictly worse than sprite selection, not better. Security: the generated scene is content like any other asset and inherits the actor's visibility and content-rating gates. Authorization: the scene must be generated for actors the requesting user owns. Resource: a full scene render is materially more expensive than a portrait; it must not be triggered per message. Rollback: the feature is additive; disabling the strategy setting removes the path. Stale state: none — scenes are immutable assets. Idempotency: seed-locked per `TASK-identity-lock-seed-negative-prompt-and-anchor.md`. Observability: log that the ground-up rung ran; a silent downgrade to sprite selection defeats the purpose.

**Summary:**

Full ground-up generation of a scene image **including the background**, as the
escape hatch for character interactions that no per-actor variant can express.
This is the user's stated workaround for the accepted limitation that display
modes cannot show interactions.

**Context:**

**The limitation being escaped.** VN mode and other display modes render actors
per message; `msgToScene`
(`src/frontend/vn/scene-renderer/render.ts:53-55`) synthesizes a single-speaker
cast, and multi-sprite staging (`src/frontend/vn/scene-renderer/stage.ts:38-39`)
needs two or more cast members and a non-overlay layout. Even with the cast
producer landed, staging places characters *on stage together* — it does not
render them **interacting** (one reaching toward another, sharing an object).
Generating the whole scene solves that by composing the interaction into the
pixels rather than placing sprites.

**Honest readiness assessment — this direction is more reachable than inpainting,
and less reachable than variant selection.** The difference is worth stating:

| Requirement | Ground-up scene generation | Inpaint / item compositing |
|---|---|---|
| Mask | **Not needed** — everything is generated at once | **Required**, hand-uploaded (`src/image-edit/templates/builtin/inpaint.ts:39-46`) |
| SAM3 | **Not needed** | Not started (`.plan/epics/epic-sam3-segmentation-integration.md:8`) |
| Identity lock | **Required** — with no reference image the result is a fresh sample | Required |
| Background prompt slot | **Does not exist today** | n/a |
| Multi-actor staging prompt slot | **Does not exist today** | n/a |

**The blocker is not a mask.** It is that the prompt composer has no slots for
the two things this feature is *for*. `single-generation.ts:37-76` composes
exactly three: identity anchor + outfit descriptor + emotion descriptor. There
is no background slot and no second-character slot. Adding them is new prompt
composition, on top of the identity work.

**Why it is nonetheless genuinely reachable** once phase 4 lands: the
ComfyUI `txt2img` workflow takes a prompt and nothing else
(`configs/workflows/txt2img.json`, driven through
`src/generation/image-engine/comfyui.ts:44-53`), so a ground-up render needs no
new workflow, no mask, no segmentation. With `img2img` available, a base
avatar can anchor the subject while the prompt supplies the scene. That is a
genuinely different readiness profile from everything else in this epic, and it
is why this direction is worth scoping rather than dismissing.

**Open design questions this ticket must answer before implementation** (and
which are why it is `Large`):

1. **Where does the scene prompt come from?** Options: the assistant reply
   itself (free, but noisy and inconsistent), a composed scene description, or
   an AUX extraction. The reply-derived route inherits every reliability problem
   the outfit extractor has.
2. **How do actors enter the scene?** Generating one image containing both
   actors means a **multi-character identity anchor**, and the current anchor is
   a single `asset.alt_text` or `actors.description`
   (`src/characters/services/emotion-avatar-fallback.ts:76-91`) — singular by
   construction.
3. **Does the background get generated every time?** Regenerating the whole
   scene on every appearance change means the background drifts between
   adjacent messages, which reads as a location teleport. Caching the background
   and only regenerating the foreground reintroduces the mask problem this
   direction was chosen to avoid.
4. **Cost.** A full scene is materially more expensive than a portrait. This
   must not be a per-message trigger.

**Acceptance Criteria:**

- [ ] A documented readiness assessment exists, covering the mask / SAM3 /
      identity-lock / prompt-slot table above, so the direction is scoped on
      evidence rather than enthusiasm
- [ ] The two missing prompt slots (background, multi-actor staging) are
      specified, with the identity-anchor problem for a multi-character scene
      called out explicitly
- [ ] The strategy is expressed through the existing selector
      (`TASK-appearance-edit-vs-generation-strategy-selector.md`) as a third
      rung, not as a parallel code path — and the rung is observable when it
      degrades
- [ ] Background drift across consecutive messages is either prevented or
      explicitly accepted and documented; the answer is a design decision, not
      an oversight
- [ ] Cost is bounded: the rung is operator-triggered or rate-limited, never
      per-message
- [ ] **No implementation is attempted until
      `TASK-img2img-init-image-plumbing.md` lands** — the ticket may land as
      a specification, with implementation deferred
- [ ] The limitation this escapes is documented in the merged epic's Non-Goals
      as the accepted state until this ticket lands

**Notes / Evidence:**

- The limitation being escaped:
  `src/frontend/vn/scene-renderer/render.ts:53-55` (single-speaker cast
  synthesis) and `src/frontend/vn/scene-renderer/stage.ts:38-39`
  (multi-sprite needs >= 2 cast, non-overlay)
- Multi-sprite builds members independently, so no interaction is composed:
  `src/frontend/vn/sprite-stage.ts:190-200`
- The prompt composer and its three slots:
  `src/characters/services/emotion-avatar-service/single-generation.ts:37-76`
- The singular identity anchor:
  `src/characters/services/emotion-avatar-fallback.ts:76-91`
- No mask needed for this direction (contrast inpaint):
  `src/image-edit/templates/builtin/inpaint.ts:39-46`
- SAM3 not required here, but not started for the compositing route:
  `.plan/epics/epic-sam3-segmentation-integration.md:8-9,50-55`
- The txt2img workflow a ground-up render would use:
  `configs/workflows/txt2img.json`, driven at
  `src/generation/image-engine/comfyui.ts:44-53`
- The img2img workflow that would anchor the subject:
  `configs/workflows/img2img.json:25-31`
- The strategy selector this must extend:
  `TASK-appearance-edit-vs-generation-strategy-selector.md`