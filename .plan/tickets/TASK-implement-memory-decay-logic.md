<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement memory decay logic

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** done
**Priority:** high
**Effort:** Medium
**Epic:** epic-crafting-professions

## Summary

decay_rate, strength, last_accessed_at columns exist but no logic uses them. Implement time-based decay: strength -= decay_rate × elapsed_days, clamped to [0,1]. Extend src/memory/purge.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
