<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: /check chat command with modifier breakdown

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics.md

## Summary

Builds on actor-resolved skill checks. Add /check <skill> [dc] to src/assistant/commands/ + gm-tool-detection intent; output shows d20 + mod (per-source breakdown) vs DC -> success/margin/crit; every check logged to dice_roll_history. Gated per TASK-rpg-gate-chat-commands (land together). Plan doc §3.3. Epic: epic-rpg-mechanics.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
