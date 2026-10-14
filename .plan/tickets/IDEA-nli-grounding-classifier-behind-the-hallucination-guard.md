<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: NLI grounding classifier behind the hallucination guard

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

detectHallucinations (src/chat/hallucination-guard/detect.ts) matches regex proper nouns against DB names and generalizes poorly to paraphrase. Slot a zero-shot NLI or embedding-similarity is-this-entity-grounded classifier behind HallucinationCheckOpts, keeping the regex path as fast fallback. Consumed at generation/auto-gen/post-store.ts:125 and generation/story-mode.ts:136.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
