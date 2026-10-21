<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: humanOverride silently drops the GM decision when serialization fails, returning success

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:**

Location: src/story/game-master/accept.ts:156-157.

Evidence: const gmSerialized = safeJsonStringify(decision); if (!gmSerialized.ok) { return; } - returns success with no log; the human override decision is lost. The function's JSDoc already declares @throws (:146-147), so returning silently contradicts the declared contract.

Verification: CODE-READ - accept.ts:150-157 re-read verbatim this session (the if (!gmSerialized.ok) { return; } shape with @throws JSDoc at :146-147). Triggering a safeJsonStringify failure needs a hostile decision object at runtime; the control flow is fully determined by the read.

Impact: an admin's human override vanishes without any error or log - the turn proceeds as if no override was given.

Fix: throw (or log and throw) on serialization failure instead of returning.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-9 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
