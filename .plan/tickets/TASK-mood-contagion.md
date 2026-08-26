<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-mood-contagion: Mood extension — emotional contagion

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Type:** TASK
**Tags:** characters, mood, contagion, group
**Epic:** Character Core System
**Parent:** TASK-character-mood-happiness (umbrella)

## Summary

Characters in proximity influence each other's emotional states — mood transfer through social interaction, with anti-spiral safeguards.

## Design

This is not personality change — it is _mood transfer_ through
social interaction.

**Contagion rules:**
1. **Proximity** — only characters in the same location/chat affect
   each other. Distance attenuates the effect.
2. **Relationship strength** — high `strength` relationships amplify
   contagion (a trusted ally's mood transfers more than a stranger's).
3. **Dominance axis** — high-dominance characters impose mood on
   low-dominance characters more than the reverse.
4. **Resistance** — `mood_stability` acts as resistance to contagion.
   A character with stability 90 is nearly immune.

```typescript
interface ContagionConfig {
  enabled: boolean;
  base_rate: number;           // 0.0–1.0: how much mood transfers per turn
  proximity_weight: number;    // multiplier for same-location
  relationship_weight: number; // multiplier per relationship tier
  dominance_weight: number;    // multiplier for dominance differential
  stability_resistance: number; // how much stability reduces contagion
}
```

**Prompt integration:** When contagion is active, the prompt section
emits the group's aggregate mood and any significant mood shifts:
_"The group's mood has shifted toward anxiety (avg pleasure: 35).
[Character A] is particularly affected by [Character B]'s distress."_

**Anti-spiral:** Contagion has a floor (pleasure cannot drop below 0)
and a recovery mechanism (baseline_happiness pulls mood back over time).
This prevents infinite negative spirals.

## Tasks

- [ ] Implement contagion engine per `ContagionConfig` (proximity, relationship-strength, dominance, and stability-resistance weighting).
- [ ] Emit group aggregate mood + significant shifts into the prompt section when contagion is active.
- [ ] Anti-spiral safeguards: pleasure floor at 0 + baseline_happiness recovery pull.
- [ ] Tests: contagion transfer rates, dominance asymmetry, resistance via mood_stability, no negative-spiral invariant.

## Dependencies

- Parent hub: `TASK-character-mood-happiness.md`
- **Depends on:** TASK-mood-core (operates on its `MoodState`).
- Sibling: uses the Dominance axis from TASK-mood-multi-dimensional if/when PAD lands; degrades gracefully to single-axis without it.
