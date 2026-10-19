<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Pose axis via `AvatarTagType.Action`

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** Deliberate scope decision: this ticket reopens the per-pose Non-Goal **for a variant axis only** — it adds no skeleton, no bone rig, no keyframe interpolation, and no pose estimation. Security: none. Authorization: none. Rollback: stop producing the tag; consumers already handle a missing value. Stale state: a pose-tagged variant persists after narration stops mentioning pose — that is the intended curated-variant model. Idempotency: pure. Observability: log the extracted action value at debug. Vocabulary: the action value set must be a closed list, or `action_first` silently degrades to a weighted match.

**Summary:**

Give the existing, declared-but-unproduced `AvatarTagType.Action` axis a
producer, so pose reaches selection **without adding a seventh tag member**.
This is the reopened per-pose Non-Goal, answered on the cheap side.

**Context:**

**`Action` is consumed everywhere and produced nowhere.** Verified:

- Declared: `src/db/enums-character/avatar.ts:8` — `Action: "action"`
- Enumerated: `ALL_TAG_TYPES` (`src/characters/services/avatar-service/selection.ts:15`)
- In the fallback chain: `DEFAULT_FALLBACK_CHAIN` (`selection.ts:18`)
- Weighted: default weight `action: 0.2` (`selection.ts:169-174`), mirrored in
  config at `src/characters/services/avatar-service/config.ts:96-100`
- Context field: `AvatarSelectionContext.action`
  (`src/characters/services/avatar-service/types.ts:56`)
- Rule branch: `case "action_first": if (context.action && avatar.tags.action) score *= 1.5`
  (`selection.ts:241-243`); the rule itself is declared at
  `src/db/enums-character/avatar.ts:20` (`ActionFirst: "action_first"`)
- **Producers: none.** The only code that populates `tags.action` is test
  fixtures (`src/characters/services/avatar-service/avatar-service.test.ts`,
  the "Attack pose" cases) — grep over `src/` finds no production writer.

**Why reuse rather than add `Pose`:** adding a seventh member means a seventh
weight default, a seventh `ALL_TAG_TYPES` entry, a seventh context field, and a
seventh `AvatarSelectionRule` branch — all to solve a problem the `Action` axis
already solves and nobody has filled in. `action_first` already exists
(`avatar.ts:17-25`); `Pose` would arrive with no rule.

**Why this is the reopened Non-Goal, honestly scoped.** The predecessor barred
"Per-pose/skeletal variation" (`epic-wardrobe-avatar-variants.md:126`). What is
reopened here is the **variant axis**: an actor who is described mid-action
resolves to a curated variant tagged `action: <value>`. What stays barred is
skeletal variation proper — there is no pose estimation anywhere in `src/`
(verified: `pose` appears only in `change_pose` regex patterns at
`src/regex/image-edit.ts:130-137`, which have zero production consumers, and in
LLM prompt prose at `src/generation/prompt-templates/templates.ts:109`).

`change_pose` (`src/regex/image-edit.ts:130-137`) is worth reading before
designing the vocabulary — its patterns already cover
`standing|sitting|lying|running|walking|jumping|fighting|casting|holding` at
confidence 0.8, and it is dead code that this ticket can either revive as a
prefilter or deliberately leave alone (it matches imperative player text, which
is the wrong shape; see the extractor ticket).

**Acceptance Criteria:**

- [ ] A closed action-value vocabulary is defined for pose-bearing actions, and
      an out-of-vocabulary value is rejected at write time rather than accepted
      as a free tag
- [ ] A production producer writes `tags.action` on avatar rows — either
      through the extraction hook's schema, or through an operator-facing write
      path; a test asserts a non-test code path writes it
- [ ] `action_first` selection actually fires: a test creates a context with
      `action` set and asserts the action-tagged avatar wins
      (`src/characters/services/avatar-service/selection.ts:241-243`)
- [ ] **No new `AvatarTagType` member is added** — the union stays at six
      (`src/db/enums-character/avatar.ts:5-12`)
- [ ] **No new `AvatarSelectionRule` is added** — `action_first` is reused
- [ ] An avatar with no `action` tag renders exactly as today under
      `action_first`
- [ ] `bun run typecheck`, `bun run typecheck:frontend`, and `bun run lint` clean

**Notes / Evidence:**

- Declared, unwired axis: `src/db/enums-character/avatar.ts:8`
- Live consumers: `src/characters/services/avatar-service/selection.ts:15`,
  `:18`, `:169-174`, `:225-232`, `:241-243`
- Context field: `src/characters/services/avatar-service/types.ts:56`
- Weight config mirror: `src/characters/services/avatar-service/config.ts:96-100`
- Rule declared: `src/db/enums-character/avatar.ts:17-25`
- Dead `change_pose` patterns (imperative player shape, zero consumers):
  `src/regex/image-edit.ts:130-137`
- Pose appears only as LLM prompt prose:
  `src/generation/prompt-templates/templates.ts:109`, `profiles.ts:120,124`
- The reopened Non-Goal: `epic-wardrobe-avatar-variants.md:126`
- Test fixtures that are currently the only producers:
  `src/characters/services/avatar-service/avatar-service.test.ts` ("Attack
  pose" cases)