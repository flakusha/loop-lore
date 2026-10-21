<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: llmDecision assembles the prompt outside the try block, so an assembly failure kills the turn instead of falling back

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

Location: src/story/gm/decisions/llm.ts:30 (assemble) vs :70 (try covers only deps.generateText).

Evidence: the module header says the strategy falls back to the hardcoded decision on failure, and llm.test.ts:16-17 pins that the assembler is invoked inside the same try-block - the source shows it is not: assembler.assemble at :29-40 precedes the try at :70. A PromptAssembler throw propagates through getGmDecision -> executeTurn and the scheduler records a genuine error: the whole turn is lost for a non-provider failure.

Verification: REPRODUCED - probe .tmp/glm-review/verify/llm-decision.ts calls the real llmDecision with a deps.db that throws on first access (logger initialized first so execution reaches the assemble call): decisive output 'REJECTED - assembly-failure-probe: db unavailable' and 'generateText ever reached (inside the try): false' - the strategy rejected with the ASSEMBLY error; the try-block fallback (llm.ts:79-91) never ran.

Impact: whole turn lost for a non-provider failure; contradicts the documented and tested fallback contract.

Fix: move the assembler.assemble call inside the existing try (the fallback path already logs and tags fallback: true).

Source: .tmp/glm-review/deep-story-crypto-1015.md F-2 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
