# TASK: NPC-to-NPC Autonomous Social Simulation

**Epic:** epic-social-interaction, NPC/Actor System
**Priority:** Medium (P6+ deferred)
**Effort:** High
**Status:** Not Started
**Created:** 2026-08-14
**Platform Candidate:** E1 (Agentic NPC autonomy — generative-agents, Inworld AI)
**Research Source:** Stanford generative-agents social simulation, Inworld AI multi-agent dialogue

## Summary

Enable NPCs to autonomously interact with each other — initiate conversations, form relationships, spread information, and create emergent social dynamics without player involvement.

## Background

Research on generative-agents (Stanford, 2023) and Inworld AI shows that living worlds require NPCs who interact autonomously. NPCs should decide to interact based on proximity, activity, relationship, and mood. Conversations between NPCs generate emergent social dynamics — information propagation, opinion formation, relationship evolution.

Extends `TASK-social-interaction.md` (player-facing social skills) with NPC-to-NPC autonomous social behavior.

## Implementation

### Decision-to-Interact

NPCs decide whether to initiate conversation based on:
- Proximity (nearby NPCs)
- Activity (idle NPCs more likely to chat)
- Relationship strength (friends chat more)
- Mood (social mood increases interaction probability)
- Time of day (social hours vs private hours)

### Conversation Generation

```typescript
interface NPCConversation {
  initiator_id: string;
  responder_id: string;
  topic: string;                    // derived from shared context/recent events
  duration_minutes: number;
  location: string;
  relationship_impact: number;      // -100 to 100
  information_exchanged: string[];  // facts propagated
  mood_impact: { initiator: number; responder: number };
  status: "initiating" | "ongoing" | "ending";
}
```

### Information Propagation

- NPCs share facts from episodic memory during conversations
- Information spreads through social network (A tells B, B tells C)
- Trust affects whether information is believed
- Gossip can distort information over propagation distance

### Emergent Social Dynamics

- Clusters form based on shared interests/values
- Conflicts emerge from incompatible beliefs
- Reputation spreads through gossip network
- Social events (festivals, meetings) increase interaction density

## Integration Points

- **TASK-social-interaction.md** — Player-facing social skills (this extends with NPC-to-NPC)
- **TASK-npc-behavior.md** — NPC state machine includes social state
- **TASK-npc-memory.md** — Episodic memory provides conversation topics
- **TASK-character-relationships.md** — Relationship strength affects interaction probability
- **TASK-character-mood-happiness.md** — Mood affects social willingness
- **epic-character-core-system.md** — Memory architecture provides facts for exchange

## Acceptance Criteria

- [ ] NPCs decide to interact based on proximity/activity/relationship/mood
- [ ] NPC-to-NPC conversations generate with topics from shared context
- [ ] Conversations affect relationship strength between NPCs
- [ ] Information propagates through social network
- [ ] Trust affects information believability
- [ ] Social clusters form based on shared interests
- [ ] Player can observe NPC conversations (ambient dialogue)
- [ ] Performance: NPC social simulation runs without blocking player interactions

## Open Questions

1. How many simultaneous NPC conversations should the system support?
2. Should NPC conversations be LLM-generated or template-based? (cost vs quality)
3. How far should information propagate before it becomes unreliable?
4. Should players be able to eavesdrop on NPC conversations?
5. How to handle NPC conversations during player-initiated interactions?
