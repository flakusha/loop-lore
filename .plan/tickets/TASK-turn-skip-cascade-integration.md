<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Turn skip cascade integration

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Skip releases the slot to the next cascade actor (group chat via filterPassedActors event path); solo chat triggers budgeted GM/ambient beat subject to generation-flow-control. No max-turns guard misfire. Acceptance: group cascade continues past skipping actor; solo skip yields ambient beat within budget.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
