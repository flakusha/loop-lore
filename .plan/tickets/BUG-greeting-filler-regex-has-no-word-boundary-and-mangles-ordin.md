<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: GREETING_FILLER regex has no word boundary and mangles ordinary words in chat auto-rename

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — GREETING_FILLER (src/regex/slugs.ts:56) already carries the word boundary: `/^(hey|hi|hello|yo|sup|what's up|so|well|um|uh|like)\b[\s,]*/i`, so `so\b` cannot match inside "soak"; the three mangling cases from the ticket ("history of Rome", "soak the bread", "umpteenth") are pinned by slugs.test.ts:167-172 ("does not mangle '%s'"), real greetings at :154-161.
**Priority:** high
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation

**Summary:**

Location: src/regex/slugs.ts:56.

Evidence: the greeting-stripping pattern has no word boundary after the greeting alternation, so any title starting hey/hi/so/well/um/uh/like plus a letter loses those characters. Real greetings still strip correctly - only the boundary case is broken.

Verification: REPRODUCED - probe .tmp/glm-review/verify/regex-captures.ts imports the real GREETING_FILLER export: decisive output 'history of Rome -> story of Rome', 'soak the bread -> ak the bread', 'umpteenth -> pteenth'; control 'hey what do you think -> what do you think' (correct case unaffected).

Impact: chat auto-rename (the consumer) corrupts titles like 'history of Rome' into 'story of Rome' silently. Tests (slugs.test.ts:153-166) only cover real greetings, so the mangling is unpinned.

Fix: /\b-gated alternation - anchor each alternative with a word boundary and allow trailing punctuation/space, e.g. /^(hey|hi|hello|yo|sup|what's up|so|well|um|uh|like)\b[,\s]*/i plus a leading-punctuation trim at the call site; pin with the three mangling cases.

Source: .tmp/glm-review/deep-regex-1015.md F-2 (gitignored; recorded here verbatim).

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): GREETING_FILLER (src/regex/slugs.ts:56) already carries the word boundary: `/^(hey|hi|hello|yo|sup|what's up|so|well|um|uh|like)\b[\s,]*/i`, so `so\b` cannot match inside "soak"; the three mangling cases from the ticket ("history of Rome", "soak the bread", "umpteenth") are pinned by slugs.test.ts:167-172 ("does not mangle '%s'"), real greetings at :154-161.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue b1d4e75 (registry tip: 9332a994e Konstantin Fedotov Close issue)
