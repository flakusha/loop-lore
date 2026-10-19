<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Outfit-change AUX task and TypeBox schema

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** Cost: every tier still costs a round trip — the regex prefilter must gate all of them, so no tier runs unless the prefilter hit. Tier ladder: `classifier` (0-shot, dedicated cheap model, preferred + fastest) → `aux` (shared AUX generative) → `general` (main model); each step is strictly slower, so the ladder walks down only when the previous tier is unconfigured or returns null. The classifier role is documented as a "Dedicated encoder classifier (Laya/Jev-class)" (`src/config/schema/generation.ts:108-109`) but no encoder decision-head client is built yet (`FEAT-classifier-model-support-complementary-to-aux-pipeline-laya-` is Not Started), so in practice tier 1 is a small/fine-tuned *generative* model on the classifier role slot — a true 0-shot encoder verdict is out of scope here. Privacy: the assistant reply is already sent to the model, so no new disclosure, but the extraction result must never be logged verbatim. Security: model output is untrusted input; validate every field against the schema before use — every tier's output, identically. Authorization: none at this layer — the gate decides. Rollback: remove the task name; the caller falls back to regex-only. Stale state: none. Idempotency: deterministic at temperature 0 on all three tiers. Observability: log the task name, the resolved tier, and the result count — never the content. Failure: a malformed or empty result must degrade to "no changes", never throw into the turn.

**Summary:**

A new `AuxTaskName: "outfit-change"` routing through the shared AUX runner across
a **three-tier ladder** — `classifier` (0-shot, dedicated cheap model, the
preferred and fastest path) → `aux` (the existing shared AUX generative model) →
`general` (the main generation model) — all three tiers emitting **one** TypeBox
result schema, `{ changes: [{ actorName, verb, garment, confidence }] }`, with a
member-set constraint on `actorName`.

**Context:**

**The dedicated-cheap-model tier already exists — no new model-selection
machinery is needed.** Three existing seams carry the whole ladder:

1. **The classifier role slot is already reserved, admin-manageable, and
   config-settable.** `ModelRole.Classifier = "classifier"`
   (`src/db/enums-core/flags.ts:84`) is in `VALID_ROLES`
   (`src/admin/model-roles.ts:25-30`), resolves DB-override → config →
   server-default in that order (`resolveModelRole`, `src/admin/model-roles.ts:53-100`),
   and has a documented config field
   `generation.modelRoles.classifier?: ModelRoleAssignment`
   (`src/config/schema/generation.ts:108-109`).
2. **`callAux` already prefers it, per task.** `CLASSIFIER_TASKS`
   (`src/aux-pipeline/runner.ts:44-52`) lists the classifier-shaped tasks
   (`intent`, `injection-check`, `transition`, `message-action`, `gm-tool`,
   `moderation`, `nsfw`); `resolveAuxRole` (`src/aux-pipeline/runner.ts:65-87`)
   tries `ModelRole.Classifier` for a listed task **only when
   `classifier.source !== "default"`** (`:77-80`), else falls through to
   `ModelRole.Auxiliary` (`:86`). This fallback policy already shipped as
   `FEAT-classifier-role-fallback-policy-in-callaux` (Status: Done).
3. **A caller can already pin any role explicitly.**
   `AuxCallOptions.role?: ModelRole` (`src/aux-pipeline/types.ts:31`) is
   checked first in `resolveAuxRole` (`src/aux-pipeline/runner.ts:71-73`), so
   `role: ModelRole.Main` sends the same call to the general generation model.
   The captioning→main fallback (`src/generation/caption-route.ts:85-89`) is the
   existing precedent for a narrow role walking up to main.

So the ladder is three `callAux` invocations differing only in `opts.role`
(`ModelRole.Classifier` → `ModelRole.Auxiliary` → `ModelRole.Main`), each
returning `AuxCallResult | null` (`src/aux-pipeline/types.ts:29-48`) so a
degrading tier is a `null` and the next rung is free. **Do not add a new role,
a new registry, or a new provider abstraction.**

**The precedent to copy is `src/chat/transition-classifier.ts` — and it is NOT
a 0-shot classifier.** It is regex-first (`REGEX_PATTERNS` `:41-59`,
`classifyWithRegex` `:64-83`), then exactly one AUX LLM call
(`classifyWithAuxLlm` `:96-143`, `callAux("transition", …)` `:115`). Its model is
selected **implicitly** through the `CLASSIFIER_TASKS` table — it never names a
role. Two lessons to carry forward: it tags every verdict with a `source`
discriminator (`"regex" | "aux-llm" | "none"`, `:157-191`), and it never throws
out of the classifier (`:170-176`). The outfit task improves on it in exactly one
respect: the tier is **explicit and configurable**, never implicit.
`src/turning/classifier-selection.ts` is the second precedent — it deliberately
reuses an existing `AuxTaskName` rather than adding one, and documents the
reliance on the classifier role in its header.

**Tier selection is configuration, not a code branch.** The flag surface already
exists; the hook ticket owns the enable switch. Flags live in `HooksConfig`
(`src/config/schema/hooks.ts:7-18`), defaults at
`src/config/schema-class/hooks.ts:7-13`, env mapping at
`src/config/schema-class/env-map.ts:163-164`, JSON schema at
`src/config/json-schema/hooks.ts:12-16`. Two precedents for exactly this shape:
`hooks.enableModerationLlmClassifier` (a boolean opting a classifier's LLM tier
in, `src/config/schema/hooks.ts:16-17`) and `nsfw.useLlmClassifier`
(`src/config/sections/nsfw.ts:75-79`, default `true` in `NSFW_DEFAULTS` at `:14`).
Note for the implementer: **there is no `src/config/sections/hooks.ts`** — a
prior note says otherwise; the hooks defaults are at
`src/config/schema-class/hooks.ts`.

`AuxTaskName` is a closed union of thirteen task names
(`src/aux-pipeline/types.ts:13-26`) — `transition`, `intent`, `memory`,
`nsfw`, `moderation`, `gm-tool`, `prompt-improve`, `prompt-analysis`,
`injection-check`, `message-action`, `chat-title`, `rag-ask`, `carriage`. Adding
`"outfit-change"` is a one-member extension; the runner
(`callAux`, defaults at `src/aux-pipeline/types.ts:29-42`) supplies provider
resolution, timeout, and temperature. Adding the member needs no other registry
edit: `CLASSIFIER_TASKS` is `Partial<Record<AuxTaskName, true>>`
(`src/aux-pipeline/runner.ts:44`) and `toTaskSignal` is the identity over
`AuxTaskName` (`src/generation/routing/task-signal.ts:60-64`).

**The rejection contract is the precedent to copy.** `src/regex/stage2-llm.ts`
documents its own rule at `:12-13`: *"any schema violation — unknown verb, target
outside the scene, unparsable JSON — returns `null` so the caller treats [it] as
absent."* The member-set check is at `:197-202`:

```
const inventory = ctx.inventory ?? [];
const sceneActors = ctx.sceneActors ?? [];
const allowed = kind === "item" ? inventory : [...inventory, ...sceneActors];
const hit = allowed.some((entry) => entry.toLowerCase() === displayName.trim().toLowerCase());
if (!hit) { return undefined; }
```

The outfit-change task applies the same shape to `actorName` against the
chat's member set, and the same case-insensitive comparison.

`verb` must be a **closed enum**, not free text — the stage-2 module rejects an
unknown verb outright, and an open verb set produces silent no-ops downstream.

**Acceptance Criteria:**

- [ ] `"outfit-change"` added to the `AuxTaskName` union
      (`src/aux-pipeline/types.ts:13-26`) with the same runner options as its
      siblings (timeout, temperature 0)
- [ ] **A 0-shot classification tier exists and is the default/fastest path:**
      the task is registered in `CLASSIFIER_TASKS`
      (`src/aux-pipeline/runner.ts:44-52`) so tier 1 resolves
      `ModelRole.Classifier` when one is configured — matching how `transition`,
      `intent`, `moderation`, and `nsfw` already behave. A test proves that with
      a `ModelRole.Classifier` override present in the DB, the request reaches
      the **classifier** model, not the auxiliary one
- [ ] **The aux-pipeline and general-model tiers remain available as fallbacks:**
      when no classifier role is configured (or tier 1 returns `null`/unparsable
      output), the task falls through to `ModelRole.Auxiliary` and then to
      `ModelRole.Main`, in that order. Two tests pin each fallback: no classifier
      configured → auxiliary model receives the request; auxiliary also fails →
      main model receives the request
- [ ] **Tier selection is explicit and configurable, not implicit:** the ladder
      order is declared by the caller, not inferred inside the runner, and a
      config flag on `HooksConfig` (`src/config/schema/hooks.ts:7-18`, defaults
      `src/config/schema-class/hooks.ts:7-13`) can pin the tier to a single rung
      (disabling the ladder entirely). Pinning to `aux` must not attempt the
      classifier tier at all. Precedents to copy:
      `hooks.enableModerationLlmClassifier`
      (`src/config/schema/hooks.ts:16-17`) and `nsfw.useLlmClassifier`
      (`src/config/sections/nsfw.ts:75-79`)
- [ ] **The tiers share ONE output schema so downstream code does not branch per
      tier:** a single TypeBox (or equivalent) schema types all three tiers'
      result as
      `{ changes: [{ actorName: string, verb: "equip" | "remove", garment: string, confidence: number }] }`.
      The task's return type carries no per-tier union — a caller receiving a
      `changes` array cannot tell which tier produced it except by an optional
      non-authoritative `source` field, mirroring the `source` discriminator on
      `TransitionClassification` (`src/chat/transition-classifier.ts:157-191`)
- [ ] Tier selection is reported in telemetry/logs as the task name plus the
      resolved tier — never the extracted content
- [ ] `verb` is validated against the closed enum; an unknown verb rejects that
      change entry rather than the whole result
- [ ] `actorName` is validated case-insensitively against the supplied member
      set, and an unmatched name is dropped — not guessed
- [ ] Unparsable JSON, an empty string, or a schema violation returns an empty
      change list; it never throws, on any tier
- [ ] The task is only invoked when the regex prefilter has already hit — the
      prefilter gates the ladder as a whole, not tier 1 alone
- [ ] Unit tests cover: valid result, unknown verb, name outside the member
      set, name differing only in case, empty array, unparsable JSON, plus one
      test per tier and one per tier-transition edge
- [ ] `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- The task union to extend: `src/aux-pipeline/types.ts:13-26`
- Runner options defaults (incl. `role?: ModelRole`): `src/aux-pipeline/types.ts:29-42`
- **Tier-1 seam — the classifier task table:** `src/aux-pipeline/runner.ts:44-52`
  (`CLASSIFIER_TASKS`) and `:65-87` (`resolveAuxRole`, incl. the
  `source !== "default"` guard at `:77-80` and the auxiliary fallback at `:86`)
- **Tier-pinning seam:** `AuxCallOptions.role` `src/aux-pipeline/types.ts:31`,
  honoured first at `src/aux-pipeline/runner.ts:71-73`; main-role walking
  precedent at `src/generation/caption-route.ts:85-89`
- **The classifier role itself:** `ModelRole.Classifier`
  `src/db/enums-core/flags.ts:84`; `VALID_ROLES` `src/admin/model-roles.ts:25-30`;
  three-step resolution `src/admin/model-roles.ts:53-100`; config field
  `generation.modelRoles.classifier` `src/config/schema/generation.ts:108-109`
- **Config flag surface (do not edit here):** `src/config/schema/hooks.ts:7-18`,
  defaults `src/config/schema-class/hooks.ts:7-13`, env map
  `src/config/schema-class/env-map.ts:163-164`, JSON schema
  `src/config/json-schema/hooks.ts:12-16`. **No `src/config/sections/hooks.ts`
  exists** — a prior note is wrong on that path
- **Tier-flag precedents:** `hooks.enableModerationLlmClassifier`
  `src/config/schema/hooks.ts:16-17`; `nsfw.useLlmClassifier`
  `src/config/sections/nsfw.ts:75-79` (default `true` at `:14`)
- **`source`-discriminator precedent (one output shape, several producers):**
  `TransitionClassification` in `src/chat/transition-classifier.ts:157-191`;
  its regex-first ladder at `:41-83` and single AUX call at `:96-143` — note it
  picks its model implicitly and is **not** a 0-shot classifier
- **Second implicit-tier precedent:** `src/turning/classifier-selection.ts`
  (header documents the classifier-role reliance; reuses `intent` rather than
  adding an `AuxTaskName`)
- **No extra registry edit for the new member:** `toTaskSignal` is the identity
  over `AuxTaskName` (`src/generation/routing/task-signal.ts:60-64`) and
  `CLASSIFIER_TASKS` is a `Partial<Record<…>>` (`src/aux-pipeline/runner.ts:44`)
- **Not built yet, out of scope here:** an encoder decision-head client —
  `FEAT-classifier-model-support-complementary-to-aux-pipeline-laya-`,
  `TASK-llama-cpp-support-for-classifier-models-gguf-encoder-serving`, and
  `TASK-llama-swap-native-support-cpu-resident-classifier-model-reci` are all
  Not Started. Tier 1 today is a small/fine-tuned *generative* model on the
  classifier role slot; the llama-swap sample config already reserves
  CPU-resident `laya-en` / `laya-multi` entries
  (`configs/config.llama-swap.example.yaml:118-146`), and their decision heads
  run outside llama.cpp
- The rejection contract to copy: `src/regex/stage2-llm.ts:12-13`
- The member-set pattern to copy: `src/regex/stage2-llm.ts:197-202`
- The stage-2 payload shape that puts the member sets in the prompt:
  `src/regex/stage2-llm.ts:96-101`
- The chat member-set resolver that supplies those names:
  `src/generation/auto-gen/resolve-known-names.ts:36-68` (participants +
  current location; swallows DB errors and returns `[]`)
- Stage-1 regex cannot produce an actor target at all —
  `src/regex/action-parser.ts:161` hardcodes `kind: "item"`