# EPIC: Emergent Narrative Design Principles

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Design Principle Epic
**Source:** .plan/epics/epic-rpg-patterns.md §6.7, §7, §9

## Summary

A cross-cutting **design lens** for loop-lore's mode-switch RPG layer, distilled from
non-AI emergence theory: the **MDA framework** (Mechanics → Dynamics → Aesthetics),
immersive sims (tools + consistent rules, no enforced solution), non-binary mechanics,
and dominant-strategy avoidance. The whole value prop of AI-RPG is _emergent narrative_;
these principles keep it from collapsing.

## Principles

1. Provide **simple, consistent rules** (stats, dice, faction standing) so emergence has
   a substrate.
2. Prefer **non-binary states** (wounds/penalties, suspicion meters) over binary
   alive/dead.
3. **Avoid dominant strategies** — one over-effective playstyle collapses depth.
4. Let players **earn story points** to steer (see `epic-agency-story-points.md`).
5. **Consequences persist** (Undertale) — pair mechanics with narrative reason to invest.
6. Use **MDA** as the design feedback loop for every mode switch.

## Application

- Mode-switch design (`epic-worlds-extension.md`, `epic-rpg-mechanics.md`)
- Group-chat / multi-actor orchestration (`src/turning`)
- Memory / lorebook injection (avoid over-determining the narrative)

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| RPG Mechanics | Simple consistent rules (stats, dice, faction) | Substrate for emergence — MDA loop needs rules to emerge from |
| Social Interaction | Reputation, relationship state | Consequence persistence, narrative stakes |
| World & Locations | Persistent world state | Consequences persist across scenes (Undertale principle) |
| Memory / Lorebook | Narrative context injection | Avoid over-determining narrative; memory informs emergent events |
| Agency Story Points | Player steering currency | Players earn/spend story points to steer (principle 4) |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| All mode-switch systems | Design lens (non-binary, anti-dominant-strategy) | `epic-worlds-extension.md`, `epic-rpg-mechanics.md` apply principles at mode boundaries |
| Multi-actor orchestration | Emergence guardrails | `src/turning` group-chat orchestration avoids degenerate loops |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| StoryPoint | Agency Story Points, RPG | Player steering currency (principle 4) |
| ReputationScore | Social, Faction | Consequence persistence model |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `narrative.principle_check` | subscribes → mode-switch | Mode design validates against emergence principles |
| `storypoint.spent` | subscribes ← Agency Story Points | Player steering affects narrative direction |

---

## Related

`epic-rpg-mechanics.md`, `epic-worlds-extension.md`, `epic-social-interaction.md`,
`epic-multi-session.md`

## Linked Tasks

- TASK-emergent-narrative-design.md
