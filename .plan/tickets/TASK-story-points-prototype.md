<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Story Points Prototype

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Related:** epic-agency-story-points.md, epic-rpg-mechanics.md

## Summary

Prototype the **player-earned story point** meta-currency (Bennies / FATE / Inspiration)
that lets users steer generation or retry rolls without breaking the LLM's authorial
role. Validates `epic-agency-story-points.md`.

## Rationale

- Proven in TTRPGs (rpg-landscape.md §6.4); strong fit for chat-RPG agency.
- Pairs with emergent narrative (players become causal agents, §6.7).

## Current State

- Schema + service landed: `actor_story_points` (migration `019`), earn/spend/cap
  mutations in `src/services/agency/story-points/`.
- HTTP surface: `POST /api/agency/spend` (authz: session must own `actor_id`),
  `GET /api/agency/balance` (session-scoped read for the chip).
- Spend hooks wired into the generation control plane via
  `chargeStoryPointsForChat` (`src/services/agency/spend-helpers.ts`), consumed
  by the regenerate and retry routes.
- UI: `chat/story-points-chip.html`, mounted from `src/views/chat.html`.
- Earn hooks for roleplay signal / arc completion are NOT wired yet — the
  balance is currently only credited by explicit service calls.

## Architecture (sketch)

- Table `actor_story_points (actor_id, world_id, balance, earned_total)`.
- Earn hooks: trait-consistent roleplay signal, arc completion, in-world achievement.
- Spend paths: generation bias flag, retry-with-twist, resolution reroll.
- UI: small "story points" chip in chat input with spend menu.

## Acceptance

- [x] Schema + migration — `019_actor_story_points`, partial-unique follow-up
      `020_actor_story_points_partial_unique`
- [x] Earn + spend service — `src/services/agency/story-points/`
      (mutations + queries + typed errors), spend hooks consumed by the
      regenerate and retry routes
- [x] Minimal UI affordance — `chat/story-points-chip.html` reading
      `GET /api/agency/balance`
- [x] Unit test for earn/spend invariants —
      `src/services/agency/story-points.test.ts`,
      `src/routes/agency/spend.test.ts`, `src/routes/agency/balance.test.ts`
- [ ] Earn hooks (roleplay signal, arc completion) — deferred; balances are
      credited by explicit service calls only
