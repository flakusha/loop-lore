<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide LLM image prompt writer fate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-prompt-templating

**Summary:**

The writer path (buildImagePrompt / buildImagePromptMessages / resolveProfile) is test-only today; decide ship vs formal park. If shipped: per-format system prompts (messages.ts:systemPromptForFamily) become the regime contract for assistant-authored prompts and the profile registry gets a live caller; if parked: mark dormant explicitly like src/prompts/purposes.ts does for imagePrompt. Output: decision recorded on this ticket, follow-up ticket if ship.

**Context:**

The writer path (`buildImagePrompt`/`buildImagePromptMessages`/`resolveProfile`) is test-only today; the registry constants are read only by admin routes. Open question 3 of `epic-image-prompt-templating`.

**Acceptance Criteria:**

- [ ] Decision recorded on this ticket: ship vs formal park
- [ ] If shipped: per-format system prompts (`messages.ts:systemPromptForFamily`) become the regime contract for assistant-authored prompts and the profile registry gets a live caller; follow-up ticket filed
- [ ] If parked: dormancy marked explicitly, like `src/prompts/purposes.ts` does for `imagePrompt`
