<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Classifier-backed actor and beat selection for turn decisions

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Turn selection is mechanical: weighted-random talkativity (src/turning/turn-manager/turn-strategies.ts), temporal cooldowns, keyword PASS tokens, and an expensive unstructured GM LLM decision that parses nothing (src/story/gm/decisions/llm.ts). Add a small-classifier decision path: 0-shot or fine-tuned encoder picks which addressed actor should take the beat and the beat type, feeding the quest-driven and hybrid STRATEGY_MAP stubs and replacing prose parsing in llmDecision. Semantic addressee resolution in group chat (mention-parser exact-name matching only) folds in as the first label set.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
