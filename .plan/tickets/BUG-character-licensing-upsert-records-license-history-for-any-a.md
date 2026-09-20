<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: character-licensing upsert records license_history for any actor_type including non-character actors

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

**Summary:** POST character-licensing at src/routes/character-licensing.ts:147 upserts a license_history row for any actor (user, npc, character). Only characters should have a license audit trail; logging rows for user/npc actors pollutes the audit.

**Where:** src/routes/character-licensing.ts:147

**Defect:** No guard that actor.actor_type === "character" before license_history insert. Side effect: a user requesting a license for their own user-actor row creates a spurious license_history entry that other audit reports must filter out.

**Fix sketch:** Add guard: if (actor.actor_type !== "character") return 400 with reason "licenses are only issued to character actors".

**Acceptance:** A test where caller submits a license upsert for a user-actor — current code writes license_history; fixed code returns 400.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
