<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Property-test the regex action parser verb and target extraction

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-library-distribution

**Summary:**

parseActionStage1 (src/regex/action-parser.ts:218) and extractTarget are the highest-risk untested surface in the regex pipeline: they parse untrusted LLM output, and a mis-parse becomes a wrong game action rather than an error.

Existing tests are example-based, so they cover the phrasings already thought of. Properties to assert:
- for a phrase containing verb v, parseActionStage1(phrase).verb === v
- extractTarget output length always lands in the documented target-length range, for every input it returns non-null for
- parseActionStage1 returns null (never a partial action) for input that matches no known verb
- the stage-1-only contract holds: no input falls through to the stage2 parser

Generate phrases from a grammar over known verbs plus adversarial shapes — empty string, whitespace only, unicode lookalikes, punctuation-only, mixed case, very long input — rather than from schemaToArbitrary, which has nothing to say about this function's input space.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
