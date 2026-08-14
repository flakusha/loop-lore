# TASK: Character Growth & Development System

**Epic:** epic-character-core-system
**Priority:** Medium
**Effort:** High
**Status:** Not Started
**Created:** 2026-08-14
**Platform Candidate:** E1 (Agentic NPC autonomy — personality maturation)
**Research Source:** Character progression patterns, RPG skill systems, narrative milestone frameworks

## Summary

Implement character growth systems — skill progression, personality maturation, narrative milestones, and character arc templates that evolve characters over time through gameplay and story events.

## Background

Characters in long-running RPG sessions need meaningful progression beyond stat increases. Research on character development in RPGs and interactive fiction shows that personality maturation, skill mastery, and narrative milestones create deeper engagement than pure stat growth.

Extends `epic-character-core-system.md` with growth mechanics.

## Implementation

### Skill Progression

```typescript
interface SkillProgression {
  skill_id: string;
  name: string;
  level: number;
  experience: number;
  experience_to_next: number;
  mastery_rank: "novice" | "apprentice" | "journeyman" | "expert" | "master";
  specializations: string[];    // sub-skills unlocked at higher levels
  last_used: Date;
  decay_rate: number;           // unused skills decay slowly
}
```

### Personality Maturation

```typescript
interface PersonalityGrowthEvent {
  character_id: string;
  trait_affected: string;       // which trait changed
  direction: number;            // -1 to +1 (how it shifted)
  magnitude: number;            // 0–100 (how much)
  trigger: string;              // what caused the change
  narrative_context: string;    // story moment that drove growth
  timestamp: Date;
}
```

Character personality traits shift through significant story events:
- Traumatic events can harden or soften traits
- Positive relationships can increase openness
- Repeated success builds confidence
- Failure can build resilience or cause retreat

### Narrative Milestones

```typescript
interface NarrativeMilestone {
  id: string;
  character_id: string;
  name: string;
  description: string;
  category: "personal" | "relational" | "achievement" | "tragedy" | "transformation";
  effects: {
    stat_changes?: Record<string, number>;
    trait_shifts?: Record<string, number>;
    unlocked_abilities?: string[];
    relationship_changes?: Record<string, number>;
  };
  achieved_at: Date;
  narrative_context: string;    // the story moment
}
```

### Character Arc Templates

Pre-defined arc patterns that guide character growth:
- **Hero's Journey** — call → threshold → trials → transformation → return
- **Fall from Grace** — power → corruption → redemption (or not)
- **Coming of Age** — innocence → experience → wisdom
- **Redemption Arc** — guilt → atonement → forgiveness
- **Tragic Hero** — greatness → flaw → downfall

## Integration Points

- **epic-character-core-system.md** — Growth is core character lifecycle
- **TASK-character-mood-happiness.md** — Significant events affect mood and growth
- **TASK-character-relationships.md** — Relationships drive relational milestones
- **epic-character-internal-traits.md** — Growth affects internal trait values
- **epic-rpg-mechanics.md** — Skill progression ties to RPG systems
- **epic-agency-story-points.md** — Growth events trigger aspiration updates

## Acceptance Criteria

- [ ] Skill progression tracks experience and levels
- [ ] Skills decay when unused (slow, not punitive)
- [ ] Personality traits shift through significant story events
- [ ] Narrative milestones record character achievements
- [ ] Milestone effects apply stat/trait/ability changes
- [ ] Character arc templates guide growth direction
- [ ] Growth events are stored in episodic memory
- [ ] Growth is visible in character profile/card
- [ ] Growth integrates with mood and relationship systems

## Open Questions

1. Should personality maturation be gradual or event-driven?
2. How fast should skills decay when unused?
3. Should character arcs be player-chosen or emergent from gameplay?
4. How to handle growth in group chat (multiple characters growing)?
5. Should growth be reversible (can characters regress)?
6. How to balance growth speed between active and inactive characters?
