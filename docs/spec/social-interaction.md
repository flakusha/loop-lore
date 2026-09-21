<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Social Interaction Specification

> **Status:** Design target for the d20 social-skill system; reputation and battle-social primitives are implemented. Earlier revisions' "Final" status overstated reality. Authoritative source is `src/` and AGENTS.md.

## Implemented

- Reputation: shared `ReputationScore` value object with tier calculation (`src/schemas/reputation.ts`, owned by Social/Faction); `src/rpg/reputation.ts` (TASK-042) applies/replays `status_effect` rows (`category: "reputation"`) through the canonical calculator — no private reputation table, never collapsed into a global faction score.
- Battle-social actions: `/api/battle/social/{intimidate,taunt,surrender,rally,inspire,demoralize}` (`src/routes/battle/social.ts`) with morale tracking (`src/battle/social-integration/`).
- Generic d20 checks: roll + modifiers vs DC with critical success/failure (`src/battle/resolution-integration/checks.ts`).
- Contracts: faction and social systems share the one `ReputationScore` type (`src/rpg/integration-registry/`).

## Not implemented / aspirational

- Persuasion / deception / barter / leadership / performance / diplomacy skill system and DC-modifier tables; Insight lie-detection; `social_skill_checks` and faction-standings tables; a `src/social/` module; guilds; dedicated social API routes.

## Unique content (compressed)

- Skill list (design): Persuasion (CHA), Intimidation (STR/CHA), Deception (CHA), Insight (WIS), Performance (CHA), Barter (CHA/INT), Leadership (CHA/WIS), Diplomacy (CHA/INT).
- Reputation tiers (design intent): standing titles with social effects; canonical tier logic lives in `src/schemas/reputation.ts`.

## Epics

- `.plan/epics/epic-social-interaction.md` (Not Started)
- `.plan/epics/epic-faction-reputation.md` (Not Started)
- `.plan/epics/epic-social-graph.md`
