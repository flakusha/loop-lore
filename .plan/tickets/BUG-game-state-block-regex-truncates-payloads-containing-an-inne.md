<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: GAME_STATE_BLOCK regex truncates payloads containing an inner fenced code block

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:**

Location: src/regex/game-state.ts:17.

Evidence: the lazy [\s\S]*? capture stops at the first inline fence marker (three backticks) anywhere in the payload, including a fence that is part of the game-state string content itself (e.g. code embedded in a description field).

Verification: REPRODUCED - probe .tmp/glm-review/verify/regex-captures.ts imports the real GAME_STATE_BLOCK export: decisive output 'captured payload truncated at the inner fence' - a payload whose string value contains an inner fenced code block extracts only the text before it (payload {a: code + three-backticks + json here} extracts as {a: code ).

Impact: the consumer (src/game-state/service.ts:68-71) safely rejects the truncated JSON, so the whole game-state block is silently dropped - state updates vanish, no corruption.

Fix: terminate on a line-anchored fence instead of any inline marker: [\s\S]*? followed by (?:^|\n), then the three-backtick marker, then (?:\s*$|\n); pin with an inner-fence payload case.

Source: .tmp/glm-review/deep-regex-1015.md F-3 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue 1071224 (registry tip: 2c7cc6f76 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-GAME-STATE-BLOCK-REGEX-TRUNC)
