<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Outfit narrative extractor — regex prefilter

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-reactive-actor-appearance
**Caveats:** Collision: this is why the module is new and not an extension of `src/regex/image-edit.ts` — its `change_outfit` (0.9) always beats its own greedy `add_accessory` (0.7) on any "put on X". **Tier-agnostic by construction:** the downstream extractor runs a three-tier ladder (`classifier` 0-shot → `aux` → `general` main model; see `TASK-outfit-change-aux-task-and-typebox-schema`), and this prefilter gates **all three** — a miss short-circuits the ladder entirely, so a hit is the only thing that spends a model round trip. That makes a false negative here a silent feature gap and a false positive a wasted call, which is why the confidence values must stay distinct from `change_outfit`/`add_accessory`. This module must never import, name, or branch on a tier: it emits a boolean hit plus its own confidence, nothing else. Security: the regex runs over LLM output, never over user input; a pathological reply must not ReDoS the turn. Authorization: none at this layer. Rollback: delete the module; nothing else consumes it. Stale state: none. Idempotency: pure. Observability: log a hit count, not content. Regex safety: bound repetition counts; the existing modules do not, and a hostile or degenerate reply is untrusted input.

**Summary:**

A new `src/regex/outfit-events.ts` with narrative-shaped `OUTFIT_EQUIP` /
`OUTFIT_REMOVE` groups, modelled on `src/regex/story-events.ts`. Zero wiring
today, so it inherits no collisions. It is the **single, tier-agnostic gate** in
front of the three-tier extractor ladder (0-shot `classifier` → `aux` →
`general`), so its only job is deciding whether any model runs at all.

**Context:**

**Why this prefilter matters more under a three-tier ladder, not less.** The
extractor resolves a model tier before it resolves a model
(`src/aux-pipeline/runner.ts:65-87`), so every tier is a real network round trip
with the aux-pipeline's 2s hard timeout (`src/aux-pipeline/types.ts:32-33`).
With only one downstream tier, a prefilter miss just skipped one call; with
three, a miss skips the whole ladder. The prefilter is therefore the tier-0 rung
in substance, and it must stay **structurally unaware** of the tiers — same
input, same output shape, regardless of which tier would run.

**The precedent for a regex-first, multi-source classification module is
`src/chat/transition-classifier.ts`.** Its shape is: local patterns first
(`REGEX_PATTERNS` `:41-59`, `classifyWithRegex` `:64-83`), then an LLM step
(`classifyWithAuxLlm` `:96-143`), then an explicit "nothing detected" result
(`:180-190`). Every verdict carries a `source` discriminator
(`"regex" | "aux-llm" | "none"`, `:157-191`) and the classifier never throws
(`:170-176`). Copy that discipline: a clean negative is a first-class outcome
here too, because a false positive is what spends the ladder.

Note for the implementer: that classifier is **not** a 0-shot classifier — it is
regex + one generative AUX LLM call, and its model is chosen *implicitly*
through the runner's `CLASSIFIER_TASKS` table
(`src/aux-pipeline/runner.ts:44-52`) rather than by an explicit tier. The
outfit extractor's tiers are declared explicitly (see
`TASK-outfit-change-aux-task-and-typebox-schema`), so this prefilter must not
acquire a tier parameter of its own.

**Every outfit-shaped verb that exists matches imperative commands to the
assistant, not third-person narration.** Verified:

- `src/regex/image-edit.ts:106-108` — `change_outfit`:
  `/(?:change|put on|wear|dress)\s+(?:the\s+)?(?:in\s+)?(.+)/i` and two
  siblings, confidence 0.9
- `src/regex/image-edit.ts:113-119` — `add_accessory`:
  `/(?:add|put on|give)\s+(?:a\s+)?(.+?)(?:\s+(?:to|on|for)\s+(.+))?$/i`,
  confidence 0.7 — greedy and swallows nearly any "put on X"; the
  higher-confidence `change_outfit` always wins. **That is the exact collision
  not to reproduce.**
- `src/regex/action-parser.ts:76-79` (`\bput on\b|\bdon\b` under `Equip`) and
  `:81-84` (`\btake off\b|\bremove\b|\bd off\b` under `Unequip`)
- `src/regex/story-events.ts:73-82` — `ITEM_GIVE` / `ITEM_TAKE` / `ITEM_DROP`:
  generic items, **no garment vocabulary at all**

There is **no** `undress|strip` pattern anywhere in `src/regex/`. None of these
match "Mira shed her cloak", "he donned his armour", "she was wearing a
travel cloak".

`src/regex/image-edit.ts` and `src/regex/story-events.ts` both have **zero
production consumers** — grep finds only their own tests. Two traps:

- **"image-edit" greps lie.** `src/regex/image-edit.ts` is a dead pattern
  library; `src/image-edit/` is a live 22-file subsystem mounted at
  `/api/v1/image-edit/run` (`src/image-edit/routes.ts:64-74`). A contributor who
  greps `image-edit` sees a routed subsystem and concludes the patterns are
  wired.
- The regex module's own test comment points at `image-edit-commands.ts`
  (`src/regex/image-edit.test.ts:14`) — **a module that does not exist in the
  tree**.

Design guidance, modelled on the narration-shaped groups that do work:

- Subject-noun shapes: `(?:shed|saw|doffed|discarded|removed)` /
  `(?:donned|put on|wore|clad|was wearing)`
- Possessive/pronoun subjects allowed; bare imperative addresses the assistant
  and must not fire
- Garment vocabulary is a closed list, not a free capture — the capture group is
  the **garment**, matched case-insensitively
- Confidence must be **distinct per group** and must not overlap the
  `change_outfit` / `add_accessory` values, so a future unification of the two
  modules cannot produce an ambiguous winner

**Acceptance Criteria:**

- [ ] New module `src/regex/outfit-events.ts` exporting narrative-shaped
      `OUTFIT_EQUIP` and `OUTFIT_REMOVE` groups with per-group confidence
- [ ] **The module is tier-agnostic and gates the whole three-tier ladder:** its
      signature takes only the reply text and returns a hit + confidence + the
      matched groups — no tier parameter, no tier import, no branch on which
      tier will run. A test asserts a *miss* returns the same shape as a *hit*
      (the caller's "don't run any tier" signal) and never throws
- [ ] **Tier selection stays explicit and configurable elsewhere:** no tier
      constant, role name, or `config.hooks` flag is read from this module. Tier
      selection lives in
      `TASK-outfit-change-aux-task-and-typebox-schema` (`AuxCallOptions.role`,
      `src/aux-pipeline/types.ts:31`, honoured at
      `src/aux-pipeline/runner.ts:71-73`) and in the `config.hooks` flags at
      `src/config/schema/hooks.ts:7-18` (defaults
      `src/config/schema-class/hooks.ts:7-13` — there is **no**
      `src/config/sections/hooks.ts`). A reviewer can confirm this by grepping
      the new module for `ModelRole|classifier|tier` and finding nothing
- [ ] **One downstream output shape:** the module's output is the single input
      contract for every extractor tier, so it must not encode a tier-specific
      field. A clean negative is a first-class return value (mirroring
      `classifyTransition`'s `source: "none"`,
      `src/chat/transition-classifier.ts:180-190`), not a throw and not a
      sentinel error
- [ ] At least these narration shapes match: "Mira shed her cloak",
      "he donned his armour", "she was wearing a travel cloak",
      "Rin discarded the borrowed coat"
- [ ] These imperative shapes do **not** match: "put on the blue dress",
      "wear armor", "change your outfit" — the regex must not fire on
      instructions addressed to the assistant
- [ ] Garment vocabulary is a closed list; a non-garment capture does not match
- [ ] No regex in the module uses unbounded repetition over untrusted input
- [ ] The module has no import from `src/image-edit/` and no production caller
      in this ticket (it is a leaf); a comment states who consumes it
- [ ] Unit tests cover every shape above, plus a hostile-input case
      (long repeated token) that completes promptly
- [ ] `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- Dead imperative patterns: `src/regex/image-edit.ts:103-119` (`change_outfit`
  0.9 vs `add_accessory` 0.7 — the collision)
- Play-shaped equip verbs: `src/regex/action-parser.ts:76-79` and `:81-84`
- Narration-shaped module to model on: `src/regex/story-events.ts:59-82`
  (no outfit group; items are generic)
- No `undress|strip` pattern exists anywhere in `src/regex/`
- The live subsystem that shares the name: `src/image-edit/routes.ts:64-74`
- The dangling test pointer: `src/regex/image-edit.test.ts:14` references
  `image-edit-commands.ts`, which is not in the tree
- Stage-1 `extractTarget` hardcodes `kind: "item"` and never sets an id
  (`src/regex/action-parser.ts:161`) — the reason a new module, not this one,
  carries actor attribution
- **Regex-first multi-source classification precedent:**
  `src/chat/transition-classifier.ts` — patterns `:41-59`, local pass `:64-83`,
  LLM step `:96-143`, source discriminator + never-throws contract `:157-191`.
  It is **not** a 0-shot classifier and it picks its model *implicitly* via
  `CLASSIFIER_TASKS` (`src/aux-pipeline/runner.ts:44-52`)
- **Why every tier costs a round trip:** `AuxCallOptions.timeoutMs` defaults to
  2000 (`src/aux-pipeline/types.ts:32-33`) and `callAux` applies that hard
  timeout to every call — default constant `src/aux-pipeline/runner.ts:30`,
  applied at `:192` via `withTimeout` (defined `:234-243`) — the reason a
  prefilter miss must skip the entire ladder
- **Where tier selection actually lives:** `AuxCallOptions.role`
  (`src/aux-pipeline/types.ts:31`) resolved first in `resolveAuxRole`
  (`src/aux-pipeline/runner.ts:71-73`); the classifier role slot is
  `ModelRole.Classifier` (`src/db/enums-core/flags.ts:84`, config field
  `src/config/schema/generation.ts:108-109`) — none of it belongs in a regex
  module