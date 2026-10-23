<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Resolve dormant EmotionEntry prompt field

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-image-prompt-templating

**Summary:**

EmotionEntry.prompt (src/config/sections/templates.ts) has no reader — resolveEmotionPromptModifier consumes only intent. Either wire it into the avatar template-selection fallback or drop the field and its example-config mentions. Prefer resolution before layering more avatar template fields (packs epic dependency).

**Context:**

`EmotionEntry.prompt` (`src/config/sections/templates.ts`) has no reader — `resolveEmotionPromptModifier` consumes only `intent`. Open question 4 of `epic-image-prompt-templating`. Prefer resolution before layering more avatar template fields.

**Related:** FEAT-image-prompt-template-packs (field resolution precedes pack avatar fields)

**Acceptance Criteria:**

- [ ] Decision made: wire vs drop
- [ ] If wired: `EmotionEntry.prompt` feeds the avatar template-selection fallback
- [ ] If dropped: field removed and example-config mentions cleaned up
- [ ] Tests cover the chosen behavior
