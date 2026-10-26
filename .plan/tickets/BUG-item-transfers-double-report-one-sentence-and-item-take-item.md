<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Item transfers double-report one sentence and ITEM_TAKE/ITEM_DROP capture only the first character of the item name

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-inventory

**Summary:**

Two defects converging on garbage inventory events.

A. Double-report (src/story/events/extraction.ts:226-245): detectItemTransfers loops itemPatterns and each matching pattern pushes its own ItemTransfer event - one sentence matching both a take and a give pattern yields duplicate events, so applyItemTransfer runs the transfer twice. Fix direction: first-match-wins per sentence.
Verification: CODE-READ - the for-loop over itemPatterns with no first-match break re-read verbatim this session; a same-sentence double match needs the full extraction entry point live.

B. One-character captures (src/regex/story-events.ts:77-78 ITEM_TAKE, :81-82 ITEM_DROP): lazy ([A-Za-z\s]+?) with nothing required after it captures one character. Contrast ITEM_GIVE (:73-74) which requires \s+(?:to\s+|for\s+) and captures correctly.
Verification: REPRODUCED - probe .tmp/glm-review/verify/regex-captures.ts imports the real ITEM_TAKE/ITEM_DROP/ITEM_GIVE exports: decisive output 'He takes the key from the table. => group1 = k', 'She picks up a scroll. => s', 'They find a hidden gem. => h', 'He drops the sword. => s', ITEM_GIVE control => sword; the consumer loop over ITEM_PATTERNS emits an event with item = s.

Impact: every consumer of ITEM_PATTERNS (src/regex/index.ts:108 -> event extraction -> applyItemTransfer) gets garbage item names and double transfers from ordinary narration. Existing tests (story-events.test.ts:220-236) only assert .test() truthiness, so the capture is unpinned.

Fix: require a terminator on both patterns, e.g. keep the lazy group ([A-Za-z\s]+?) and follow it with an optional quoted-punct group plus the terminator alternation (?:\s+(?:from|with|and)\b|[,.;!?]|$), pinned with capture-assertion tests; make detectItemTransfers first-match-wins per sentence.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-12 + .tmp/glm-review/deep-regex-1015.md F-1 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 5acbda7 (registry tip: 0081fd6d8 Konstantin Fedotov Close issue)
