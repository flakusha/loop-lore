<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Appearance edit-vs-generation strategy selector

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** This ticket ships a decision surface whose primary target does not exist yet — that is intentional (the fallback must be exercisable from day one), but it means the selector is untested against a real edit until `TASK-img2img-init-image-plumbing.md` lands. Security: none. Authorization: the strategy is operator config, never per-message user input. Rollback: default to `generation`; that is today's behaviour exactly. Stale state: config changes take effect for subsequent generations, not in-flight ones. Idempotency: pure function of (strategy, capability). Observability: log the resolved strategy **and** whether a fallback occurred — a silent downgrade is exactly the failure this ticket exists to prevent.

**Summary:**

An explicit operator/config-level strategy selector with **edit-preferred,
generation-fallback** semantics: use `edit` when it is available *and* selected;
otherwise fall back to `generation` when generation is selected or is the only
option available. This is the user's decision 1.

**Context:**

**The user's decision accepts identity drift** and asks for a selection
mechanism rather than a hard dependency. That shapes the contract precisely:

| Strategy selected | Edit available | Result |
|---|---|---|
| `edit` | yes | edit |
| `edit` | no | **fall back to generation** (not an error, not a no-op) |
| `generation` | yes | generation |
| `generation` | no | generation (the only option) |

The fallback must be **observable**, never silent. A caller who selected `edit`
and got txt2img has drifted identity; if that is invisible, the selector is
decorative.

**Where the strategy belongs.** `GenerationConfig` already owns the
emotion-avatar generation policy at `src/config/schema/generation.ts:115-119`:

```ts
emotionAvatar?: {
  /** Fallback mode when edit model is unavailable: "generation" uses txt2img, "none" disables fallback */
  fallbackMode?: "generation" | "none";
};
```

Note the existing docstring already speaks of an "edit model" that does not
exist in the code — the config surface anticipated this and was never filled
in. The new strategy sits alongside it rather than replacing it: `fallbackMode`
is about what happens when an edit model is absent, while the strategy is about
what the operator asked for in the first place. Wiring them into one field would
conflate two axes.

**What "edit is available" means must be an explicit, testable predicate**, not
an implicit fall-through. At minimum it requires: an init-image field present on
`ImageGenOptions` (today it is not —
`src/generation/image-engine/types.ts:6-25`), a resolvable base avatar asset for
the actor, and a provider whose `apiFamily` supports a reference input. Provider
families are dispatched at `src/generation/image-engine/index.ts:36-61`
(`openai | sdapi | sdcpp | comfyui`), and only the ComfyUI path substitutes a
workflow with a `LoadImage` node today.

**A capability check is not optional.** `pickSdProvider`
(`src/config/schema/sd-provider.ts:19-35`) returns exactly one provider with no
failover chain, and `generation.ts:102-108` throws if none is found. An edit
attempt against a provider family that cannot honour it would fail mid-generation
rather than degrade.

**Acceptance Criteria:**

- [ ] A strategy field exists on the generation config (alongside
      `emotionAvatar.fallbackMode` at
      `src/config/schema/generation.ts:115-119`), with a closed value set
      covering at minimum `edit` and `generation`, and a documented default
- [ ] Resolution is a single pure function with the truth table in the Summary
      table above, pinned by a unit test per row
- [ ] `edit` selected with no edit capability resolves to `generation` and does
      **not** throw
- [ ] The resolved strategy **and** whether a fallback occurred are both
      recorded on the outcome, so a silent downgrade is impossible
- [ ] "Edit is available" is an explicit named predicate, not an implicit
      fall-through; a test asserts it is false when the init-image field is
      absent and when the resolved provider family cannot carry a reference
      input (`src/generation/image-engine/index.ts:36-61`)
- [ ] The default strategy produces today's behaviour exactly — same call, same
      options, no new field passed
- [ ] The strategy is operator config only; no request body can set it
- [ ] The existing `emotionAvatar.fallbackMode` field is either honoured as a
      separate axis or its stale docstring is corrected — it must not silently
      duplicate the new strategy
- [ ] `bun run schemas:check`, `bun run typecheck`, and `bun run lint` clean;
      the generated JSON schema is regenerated for the new field

**Notes / Evidence:**

- The user's decision: accept drift, add a selector with edit-preferred /
  generation-fallback semantics
- Existing emotion-avatar policy field and its edit-model docstring:
  `src/config/schema/generation.ts:115-119`
- Where that policy is consumed:
  `src/characters/services/emotion-avatar-service/generation.ts:119`
  (`fallbackMode` read from `config.generation.emotionAvatar?.fallbackMode ?? "generation"`)
- The call site the strategy governs:
  `src/characters/services/emotion-avatar-service/single-generation.ts:86`
- The init-image field that does not exist yet:
  `src/generation/image-engine/types.ts:6-25`; and the plumbing ticket that adds
  it
- Provider family dispatch: `src/generation/image-engine/index.ts:36-61`
- Single-pick provider selection, no failover:
  `src/config/schema/sd-provider.ts:19-35`; called once at
  `src/characters/services/emotion-avatar-service/generation.ts:102-108`
- Only the ComfyUI path can carry a reference input today:
  `src/generation/image-engine/comfyui.ts:44-53`
- Config JSON-schema regeneration for the new field: `bun run config:generate-schema`
  (verified to exist in `package.json`); `bun run schemas:check` gates it