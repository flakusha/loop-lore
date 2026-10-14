<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Context window willTrim is stale after injectMemories/injectEvents

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

computeContextWindow (src/chat/context-window.ts:134) sets willTrim: usagePercentage >= thresholds.imminent. Both injectMemories (line 163-187) and injectEvents (line 197-221) update totalTokens and usagePercentage on the returned context but do NOT recompute willTrim. Impact: After injection pushes context over the imminent threshold, consumers reading willTrim see false and may skip trimming, allowing the context window to overflow the token budget. Fix: Store thresholds on ContextWindow and recompute willTrim after token changes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
