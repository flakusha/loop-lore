# EPIC: Player Agency — Story Points

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Source:** .plan/research/rpg-landscape.md §6.4, §6.7, §9

## Summary

Borrow **Bennies / Fate Points / Inspiration**: a player-earned meta-currency spent to
reroll, invoke an aspect, or narratively edit the story / steer generation. Gives
chat-RPG players agency without breaking the LLM's authorial role — the player becomes a
causal agent (emergent narrative, §6.7) rather than a passive reader.

## Mechanics

- **Earn:** good roleplay of character traits, completing arcs, in-world achievements.
- **Spend:** reroll a resolution; inject a "twist" the LLM must honor; retry a
  generation; bias memory/lorebook injection.
- **Non-binary:** points are a gradient, not a binary unlock (see
  epic-emergent-narrative-design).

## Why (from research)

- Savage Worlds / FATE / D&D Inspiration proven in TTRPGs (§6.4).
- Pairs with emergent narrative (MDA): players steer without over-determining the story.

## Tasks

- TASK-story-points-prototype
- Schema: `actor_story_points` table (per actor/world)
- UI: spend affordance in chat input
- Hook into generation pipeline (bias / retry path)

## Related

`epic-rpg-mechanics.md`, `epic-assistant-generation-extensions.md`,
`epic-emergent-narrative-design.md`

## Linked Tasks

- TASK-agency-story-points.md
