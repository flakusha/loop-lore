<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: tryParseYaml rejects any document containing a brace

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The YAML probe bails out when the text contains '{', which is not a YAML-invalidity signal but the opening of a flow mapping. SillyTavern macros such as {char3} are ordinary YAML values, so any character card containing one is detected as neither YAML nor any later format and the import fails.

Evidence read on dev:

- src/characters/parser.ts:173 — if (!text.includes(':') || text.includes('{',)) { return null; }

Fix: attempt the YAML parse and treat only a thrown error as a rejection, rather than pre-screening on characters.

Source: .tmp/longcat/review-characters.md C1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
