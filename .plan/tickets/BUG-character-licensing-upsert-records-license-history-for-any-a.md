<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: character-licensing upsert records license_history for any actor_type including non-character actors

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** ✅ Done (closed 2026-09-20) — actor_type guard added after checkActorOwnership
**Priority:** medium
**Effort:** Small

## Summary

**Severity (revised 2026-09-20):** LOW-MEDIUM

**Where:** src/routes/character-licensing.ts:155 (POST handler)

**Defect:** POST /actors/:actorId/licensing calls `checkActorOwnership` which only verifies actor.owner_id === caller.userId (or caller is admin). It does NOT verify actor.actor_type === 'character'. Any actor the caller owns (user-actor, npc-actor, character-actor) can be the target of a licensing upsert, which writes a row to `character_licensing` and `recordLicenseHistory`. The handler is mounted at a generic /actors/:actorId path, so the URL does not signal character-only semantics.

**Impact:** non-character actors accumulate licensing rows. The exact downstream consequences depend on what consumes license_history — if those reports filter by actor_type === 'character', the rows are inert; if not, they pollute reports.

**Fix sketch:** After checkActorOwnership, fetch the actor row's actor_type; if !== 'character' return 400 "licenses are only issued to character actors".

## Resolution

Verified 2026-09-20 against dev ada2dd920 via src/routes/actor-auth.ts:checkActorOwnership (no actor_type guard) and src/routes/character-licensing.ts:155 (no second guard). Bug is real; impact is conditional.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
