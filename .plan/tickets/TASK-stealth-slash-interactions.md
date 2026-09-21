<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Stealth & risk slash interactions (/pickpocket /hide /blend /mimic /stalk /ambush /blend-in)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-stealth-crime

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Command surface for the Stealth & Risk category of the expanded interaction catalog: manipulating perception and managing tension. Depends on `TASK-interaction-service-foundation`.

## Scope

- `/pickpocket` — steal from a target; crime consequences route through existing `epic-stealth-crime` law/enforcement design (note: `src/rpg/crime/pickpocket.ts` is currently only a spec line in the epic, not implemented).
- `/hide` — become unseen at a location; `/stalk` — follow undetected; `/ambush` — prepare environment for sudden attack (links to battle initiative).
- `/blend`, `/blend-in` — crowd/local camouflage (food, language) to lower suspicion; `/mimic` — adopt species/type mannerisms.
- All verbs: Stealth/Deception skill checks, detection probability, action-point cost.

## Acceptance Criteria

- [ ] All 7 verbs registered in command registry, hidden when interaction service unavailable
- [ ] Detection outcomes persist (witnesses, wanted state) via social ripple
- [ ] `/ambush` hands off to battle system with initiative bonus on success
- [ ] Tests: success/failure branches, crime consequence hook

## Linked Epics

- `epic-stealth-crime.md` (EPIC-039)
- `epic-social-interaction.md` (suspicion/disposition overlap)
