<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Identity lock — seed + negativePrompt + non-degenerate anchor

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** Security: none — no new input surface, but `negativePrompt` becomes operator-influenced text reaching the model, so it must stay a body field, never prompt-interpolated story content. Blast radius: `alt_text` is user-visible in the asset UI and is the caption fallback, so changing what is written changes displayed metadata; a blank anchor is worse than the current one if the fallback chain is not checked. Rollback: revert; `alt_text` is free text. Stale state: existing rows already carry the degenerate value; this ticket does not backfill them. Idempotency: a given seed reproduces a given sample. Observability: log the seed and whether the anchor branch was used. Partial failure: a missing seed must not become a silent random draw where a caller expected determinism — record which path ran.

**Summary:**

Three defects in one file, all reachable today, no new plumbing: pass `seed`
and `negativePrompt` to `generateImages` at
`src/characters/services/emotion-avatar-service/single-generation.ts:86`, and
stop writing the degenerate `"Emotion avatar: X"` string into the prompt anchor.

**Context:**

**The call site passes three fields.**
`src/characters/services/emotion-avatar-service/single-generation.ts:86`:

```ts
const outcome = await generateImages(opts.sdConfig, { prompt, n: 1, outputFormat: "png" });
```

`ImageGenOptions` already declares `negativePrompt?: string` and `seed?: number`
(`src/generation/image-engine/types.ts:16-17`), and the ComfyUI path already
substitutes both (`src/generation/image-engine/comfyui.ts:44-53`). The plumbing
exists; the call site does not use it.

**`negativePrompt` is accepted, threaded, and dropped.** Routes accept it —
`src/validation/schemas/wardrobe.ts:51-56` defines
`negative_prompt` on both outfit-generation bodies, consumed at
`src/routes/wardrobe-avatars.ts:54` and `:83`. It is forwarded through
`runBatchGeneration` to the per-emotion call at
`src/characters/services/emotion-avatar-service/generation.ts:152`, reaching
`generateEmotionAvatar` as `opts.negativePrompt` — and then never passed to
`generateImages`. An operator tuning an outfit sets it and sees no effect, with
no error anywhere.

**The identity anchor is degenerate and self-reinforcing — this is the sharpest
part.** `single-generation.ts:100-115` persists each generated image with
`altText: `Emotion avatar: ${opts.emotion}``. On the next generation, the prompt
anchor is read from `asset.alt_text` first, falling back to `actors.description`
(`src/characters/services/emotion-avatar-fallback.ts:76-91`). So a batch of eight
emotions writes eight anchors that all read `"Emotion avatar: happy"`,
`"Emotion avatar: sad"`, … — none of which mentions the actor. Every subsequent
round anchors on that string. **This is a drift amplifier already running in
shipped code**, not a missing feature.

**The predecessor promised this and did not deliver it.**
`epic-wardrobe-avatar-variants.md:66-70` specifies: *"Identity consistency
strategy: edit-model img2img from base avatar where stable ... else seed-locked
txt2img with descriptor templates."* The seed-lock half is this ticket; the
img2img half is `TASK-img2img-init-image-plumbing.md`.

**Related honesty gap, named but not fixed here.**
`RegenerateEmotionAvatarsBody.seedStrategy`
(`src/validation/schemas/emotion-avatars.ts:23-29`) is accepted by the endpoint
and its own docstring says it is "accepted and ignored for now". This ticket must
not repeat that pattern: either wire `seedStrategy` or remove it from the schema.
Leaving a documented no-op parameter next to a new real seed path is exactly the
confusion this epic is trying to remove.

**Acceptance Criteria:**

- [ ] `generateImages` at `single-generation.ts:86` receives `seed` and
      `negativePrompt` from the call options
- [ ] A seed is derivable when the caller does not supply one, and the
      derivation is documented (deterministic from the slot, not random)
- [ ] `negative_prompt` set through the outfit-generation routes
      (`src/routes/wardrobe-avatars.ts:51` and `:80`) has an observable effect
      on the generation call — pinned by a test asserting the value reaches
      `generateImages`
- [ ] With the same seed and the same options, the generation call is identical
      across runs, pinned by a test
- [ ] The persisted `alt_text` no longer contains the literal `"Emotion avatar:"`
      prefix; the value written is derived from actor identity (e.g. the
      resolved caption) and remains non-empty
- [ ] The anchor read at `src/characters/services/emotion-avatar-fallback.ts:76-91`
      still falls back to `actors.description`, and then to
      `"character portrait"` — verified by a test on each fallback step
- [ ] `seedStrategy` on `RegenerateEmotionAvatarsBody`
      (`src/validation/schemas/emotion-avatars.ts:23-29`) is either wired to
      the seed path or removed from the schema; it does not remain a documented
      no-op
- [ ] Dedup behaviour is unchanged — the deliberate comment at
      `single-generation.ts:112-113` must still hold (a re-roll is a distinct
      row)
- [ ] Tests pass; `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- The three-field call site:
  `src/characters/services/emotion-avatar-service/single-generation.ts:86`
- The fields already exist: `src/generation/image-engine/types.ts:16-17`
- ComfyUI already substitutes both:
  `src/generation/image-engine/comfyui.ts:44-53`
- `negativePrompt` threading, and where it stops:
  `src/validation/schemas/wardrobe.ts:51-56` (schema),
  `src/routes/wardrobe-avatars.ts:54` and `:83` (routes),
  `src/characters/services/emotion-avatar-service/generation.ts:152` (forward),
  `single-generation.ts:86` (dropped)
- The degenerate anchor, written:
  `src/characters/services/emotion-avatar-service/single-generation.ts:106`
- The anchor, read: `src/characters/services/emotion-avatar-fallback.ts:76-91`
  (and `buildEmotionPrompt` at `:144-165`, whose `_emotion` parameter is unused
  by design — the emotion enters only via the modifier)
- The dedup comment that must survive:
  `single-generation.ts:112-113`
- The accepted-and-ignored parameter:
  `src/validation/schemas/emotion-avatars.ts:19-29` (docstring at `:19-22`)
- The predecessor's unbuilt promise: `epic-wardrobe-avatar-variants.md:66-70`
- Provider selection is a single pick, not a failover chain
  (`src/config/schema/sd-provider.ts:19-35`, called once at
  `generation.ts:102`) — a seed fix does not change that