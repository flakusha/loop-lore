<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Remainder — NSFW + Uncovered Systems: Triage Plan

Worktree: `rpg-nsfw-remainder`. Scout: `src/rpg/seduction/`, `src/rpg/encounters/`,
`src/rpg/intimacy/`, `src/rpg/body-systems/`, `src/middleware/nsfw-gate/`,
`src/generation/`, `src/routes/nsfw/`, `src/story/game-master/`. Verified 2026-09-08.

## 1. What exists (confirmed)

- **Seduction** (`src/rpg/seduction/service/`): desire profiles, arousal state,
  seduction skills + XP, `attemptSeduction` (hard-limit check, DC, roll, XP).
- **Encounters** (`src/rpg/encounters/`): Foreplay/Main/Aftercare phases,
  outcomes, `NsfwEncounterStatus`. **Intimacy** (`src/rpg/intimacy/`):
  thresholds 0–100, `requiresConsent` flags, pair history. **Heat**
  (`body-systems/service/heat.ts`): cycle state machine + effects.
- **Gate stack** (`src/middleware/nsfw-gate/`): `canAccessNsfw`,
  `checkNsfwWithConsent` (auth → access → persisted consent, no auto-grant),
  consent ledger (migration 069), `NsfwHook` (post-LLM classifier, fail-closed).
- **Gated today**: `triggerAutoGeneration` (pre-LLM eligibility L140 + post-LLM
  hooks L204), `routes/chats/create.ts`, `routes/worlds/access.ts`.

## 2. New confirmed gaps (tickets T12–T14 below)

| # | Gap | Evidence |
|---|---|---|
| N1 | Consent gate unwired — `checkNsfwWithConsent` has zero production callers | grep: no refs outside `middleware/nsfw-gate/` |
| N2 | `/api/nsfw/*` routes (seduction, encounters, intimacy, fantasies, location) have no gate/consent check | grep: zero `nsfw-gate\|canAccessNsfw\|consent` refs in `src/routes/nsfw/` |
| N3 | `attemptSeduction` skips `checkPrerequisites` (`nsfw/seduction-prerequisites.ts`); encounter creation skips `isSuitableForEncounter` (`location-nsfw/service.ts`) | grep: neither called outside defining modules (only unrelated skills-tree namesakes hit) |
| N4 | GM/story generation ungated (extends bypass ticket scope) | zero `nsfw` refs in `src/story/game-master/`, `src/story/gm/decisions/`; `narration.ts:28`, `execute.ts:21` gateless |

## 3. New tickets (filed this batch)

- **T12 — wire consent gate into NSFW surfaces** (N1): call
  `checkNsfwWithConsent` wherever NSFW content is served/generated for an actor
  pair (seduction attempts, encounter phase text, intimacy actions); denied →
  clean refusal + audit event. Epic: `epic-nsfw-integration-gaps.md`.
- **T13 — gate `/api/nsfw/*` routes** (N2): authZ + `canAccessNsfw` (+ consent
  where actor-targeted) on every route in `src/routes/nsfw/`; tests for
  unauthed/underage/no-consent 403s. Epic: `epic-nsfw-integration-gaps.md`.
- **T14 — seduction/encounter precondition wiring** (N3): call
  `checkPrerequisites` in `attemptSeduction`, `isSuitableForEncounter` in
  `createEncounter`; failures return typed reasons (not rolls). Epic:
  `epic-nsfw-game-mechanics.md`.

## 4. Existing-ticket updates (this batch)

- `TASK-rpg-resolution-system.md`: Not Started stub is the parent of filed
  T2/T3/T7 (actor skill checks, `/check`, ability checks) — marked In Progress
  with links. No duplicate filed.
- `TASK-story-gm-generation-never-nsfw-gated...md`: scope extended with N4
  (game-master/ paths, not just story-mode hook chain).

## 5. Explicitly not touched

- ~23 Not Started NSFW feature tasks (encounters, housing, weather, kink…):
  legitimate backlog, described, owned by their epics — no action.
- ~20 Not Started RPG feature tasks (quests, stealth, factions, housing…):
  same — backlog, not stale.
- `BUG-nsfw-runtime-config-singleton` (fix pending, owned elsewhere),
  thin pointer stubs (`TASK-nsfw-consent-integration` etc.), drafts.
- No BUG in the audited set described a defect still present on dev that
  wasn't already closed (49731047 cluster + consent fixes landed).
