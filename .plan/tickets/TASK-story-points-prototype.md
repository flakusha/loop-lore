# TASK: Story Points Prototype

**Status:** ⬜ Not Started
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

- No story-point concept in `src/` or specs.
- Resolution/dice exists but no spend/economy layer.

## Architecture (sketch)

- Table `actor_story_points (actor_id, world_id, balance, earned_total)`.
- Earn hooks: trait-consistent roleplay signal, arc completion, in-world achievement.
- Spend paths: generation bias flag, retry-with-twist, resolution reroll.
- UI: small "story points" chip in chat input with spend menu.

## Acceptance

- [ ] Schema + migration
- [ ] Earn + spend service in `src/rpg` or `src/generation`
- [ ] Minimal UI affordance
- [ ] Unit test for earn/spend invariants
