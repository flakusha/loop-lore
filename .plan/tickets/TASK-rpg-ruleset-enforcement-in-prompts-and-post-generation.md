<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: ruleset enforcement in prompts and post-generation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G10 (verified): lore is soft keyword injection (prompt/sections/lore.ts); world-traits stored but not consumed; no output compliance check. Builds on ruleset-templates ticket: inject active ruleset as hard prompt section + post-gen compliance check on hallucination-guard seam for lore-strict worlds (contradiction -> regen-with-correction or GM-flag, never silent); wire world-traits into prompts. Plan doc batch 3 #10. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
