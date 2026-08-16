<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Memory Scoring Model

**Epic:** epic-memory-knowledge-systems, epic-character-core-system
**Priority:** Medium (P6+ deferred)
**Effort:** High
**Status:** Not Started
**Created:** 2026-08-14
**Platform Candidate:** E2 (Agent memory scoring — generative-agents, RisuAI HypaMemory, Kindroid)
**Research Source:** Stanford generative-agents memory architecture, RisuAI HypaMemory/SuperMemory

## Summary

Upgrade memory purge/decay toward a scored model: recency × importance × relevance, with periodic reflection that consolidates episodic memories into semantic insights. Replaces simple time-based decay with intelligent memory management.

## Background

Research on generative-agents (Stanford, 2023) and RisuAI's HypaMemory shows that effective NPC memory requires scoring beyond simple recency. The generative-agents model uses recency × importance × relevance scoring with periodic "reflection" that synthesizes episodic memories into higher-level insights. This produces more coherent long-term character behavior than simple decay.

Extends `FEAT-memory-systems-three-tier.md` with scored retrieval and reflection.

## Implementation

### Memory Scoring

```typescript
interface MemoryScore {
  memory_id: string;
  recency_score: number;      // exponential decay from last access
  importance_score: number;   // 0–100, set at creation or by reflection
  relevance_score: number;    // 0–100, computed per-query (cosine similarity or keyword match)
  composite_score: number;    // weighted product of above
  last_accessed: Date;
  access_count: number;       // frequently accessed memories score higher
}
```

### Reflection System

Periodically (e.g., every N interactions or when episodic memory hits threshold):
1. Retrieve top-scoring recent memories
2. Synthesize into higher-level insights (e.g., "Player seems to prefer diplomatic solutions")
3. Store as semantic memory with elevated importance
4. Link source episodic memories to reflection

```typescript
interface MemoryReflection {
  id: string;
  character_id: string;
  insight: string;              // synthesized statement
  source_memories: string[];    // episodic memory IDs
  importance: number;           // elevated (70–100)
  created_at: Date;
}
```

### Scored Retrieval

When injecting memories into context:
1. Compute relevance to current situation
2. Score all candidate memories: `composite = recency × importance × relevance`
3. Select top-N within token budget
4. Update access timestamps for selected memories

## Integration Points

- **FEAT-memory-systems-three-tier.md** — Extends three-tier with scoring layer
- **TASK-memory-decay-logic.md** — Scoring replaces simple decay
- **TASK-memory-emotion-impact.md** — Emotional memories get importance boost
- **TASK-memory-promotion-pipeline.md** — Promotion feeds scored model
- **epic-character-core-system.md** — Memory architecture foundation
- **TASK-npc-memory.md** — NPC memory uses same scoring model

## Acceptance Criteria

- [ ] Memory scoring model computes recency × importance × relevance
- [ ] Composite scores update on memory access
- [ ] Reflection system generates semantic insights from episodic memories
- [ ] Reflections link to source episodic memories
- [ ] Scored retrieval selects top-N memories within token budget
- [ ] Emotional memories receive importance boost
- [ ] Frequently accessed memories score higher
- [ ] Performance: scoring runs efficiently for 1000+ memories

## Open Questions

1. How often should reflection trigger? (every N turns? on significant event?)
2. What's the right weight balance for recency vs importance vs relevance?
3. Should reflections be player-visible or system-only?
4. How to handle reflection in group chat (multiple characters reflecting)?
5. Should scoring weights be configurable per character?
