# Advanced Memory Systems Specification

⚠️ **Status: NOT IMPLEMENTED.** Three-tier memory (episodic/semantic/procedural) is aspirational.
Only basic `actor_memories` table exists (per-actor key-value for prompt assembler).
`src/generation/context-compressor.ts` does NOT exist.

## Memory Types

### 1. Episodic Memory

Chronological record of experiences. Stored as `messages` linked to chats/workspaces.
Retrieval: temporal queries, recency weighting, relevance filtering.

### 2. Semantic Memory

Extracted facts, concepts, relationships. Stored as `assets` with `label='memory'` linked to epics/tasks/characters.
Retrieval: semantic search, concept matching, relationship traversal.

### 3. Procedural Memory

Learned patterns, skills, strategies. Stored in `actor.settings.memory` as JSON.
Retrieval: pattern matching, skill activation, success rate weighting.

## Memory Architecture

Storage via polymorphic asset system. Each memory is an `assets` row linked via `asset_links`:
- `asset_type = 'memory'`
- `label`: `'episodic'`, `'semantic'`, `'procedural'`
- `asset_links` connect to chats, characters, epics, tasks

### Tables

## Memory Lifecycle

### Formation

- **Episodic**: auto-created from significant interactions (message threshold, session end, explicit request). Collect messages → generate summary → create embedding → store as asset.
- **Semantic**: extracted from episodic memories. Identify facts → validate consistency → assign confidence → store.
- **Procedural**: learned from successful patterns. Observe goal achievement → abstract procedure → validate → store with success rate.

### Retrieval Strategies

1. **Temporal**: time-range queries, recency-biased sampling
2. **Semantic**: vector similarity, keyword matching, concept hierarchy
3. **Procedural**: pattern matching on trigger conditions, context scoring

### Maintenance

- **Forgetting curves**: decay if unaccessed. Episodic fast, semantic slow, procedural variable.
- **Consolidation**: merge related memories, prune redundant, strengthen important.
- **Interference resolution**: conflicting memories flagged; recent/higher-confidence wins.

## Memory Service Interface

## Integration Points

- **Agent runtime**: auto-store interactions, query relevant memories before acting, extract knowledge after actions.
- **Chat system**: tag messages as memory-worthy, auto-summarize long chats, display memory links in UI.
- **Asset system**: reuse existing upload/storage pipeline.
- **Plugin system**: plugins contribute extraction techniques, custom memory types.

## Security

- Memories inherit access controls from linked entities
- Private marking (encrypted at rest)
- Memory sharing requires explicit permission
- Audit logging

## Config

```yaml
memory:
  enabled: true
  storageBackend: asset
  episodic: { enabled: true, maxAgeDays: 30, minMessageCount: 5, autoSummarize: true }
  semantic: { enabled: true, extractionEnabled: true, confidenceThreshold: 0.7, embeddingModel: "..." }
  procedural: { enabled: true, learningEnabled: true, minSuccessExamples: 3, decayRate: 0.01 }
  maintenance: { consolidationEnabled: true, consolidationIntervalHours: 24, decayEnabled: true }
```

## Future Extensions

- Emotional memory, social memory, creative memory types
- Memory replay during "downtime" for consolidation
- Memory-informed fine-tuning of local models
- Cross-agent memory sharing
- Memory visualization tools
- Knowledge graphs for richer semantic connections
