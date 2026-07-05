# Advanced Memory Systems Specification

> **Status:** Post-MVP (v0.2+). Three-tier memory architecture reference.
> Episodic memory basics already covered by `src/generation/context-compressor.ts` (sliding/summarize/truncate strategies).

## Overview

Loop-lore's memory system extends beyond simple chat history to provide agents and characters with episodic, semantic, and procedural memory capabilities. This enables more intelligent, context-aware behavior that persists across sessions and improves over time through learning.

## Memory Types

### 1. Episodic Memory

- **What it is**: Chronological record of experiences (conversations, actions, observations)
- **Storage**: Stored as `messages` linked to chats/workspaces
- **Retrieval**: Temporal queries, recency weighting, relevance filtering
- **Use case**: "What did we discuss in yesterday's workspace?"

### 2. Semantic Memory

- **What it is**: Extracted facts, concepts, relationships, and knowledge
- **Storage**: Stored as `assets` with `label='memory'` linked to epics/tasks/characters
- **Retrieval**: Semantic search, concept matching, relationship traversal
- **Use case**: "What are the key findings from our research on topic X?"

### 3. Procedural Memory

- **What it is**: Learned patterns, skills, strategies, and heuristics
- **Storage**: Stored in `actor.settings.memory` as JSON structures
- **Retrieval**: Pattern matching, skill activation, performance optimization
- **Use case**: "How should I approach debugging this type of error?"

## Memory Architecture

### Storage Layer

All memory types leverage the existing polymorphic asset system. Each conceptual memory becomes an `assets` row linked via `asset_links`:
- `asset_type = 'memory'`
- `label` indicates memory subtype (`'episodic'`, `'semantic'`, `'procedural'`)
- `asset_links` connect to relevant entities (chats, characters, epics, tasks)
- Content stored in appropriate format (text, JSON, embeddings)

### Memory Entry Structure

```typescript
interface BaseMemory {
  id: string; // UUID
  createdAt: Date; // When this memory was formed
  updatedAt: Date; // Last modification time
  strength: number; // Memory strength (0-1, decays over time)
  accessCount: number; // How many times this has been retrieved
  lastAccessed: Date; // When last retrieved
}

interface EpisodicMemory extends BaseMemory {
  type: "episodic";
  content: string; // The raw experience (conversation transcript, action log)
  context: {
    // Situational context
    entityType: "chat" | "character" | "epic" | "task";
    entityId: string;
    timestampRange: { start: Date; end: Date };
  };
  embedding?: number[]; // Vector embedding for similarity search
}

interface SemanticMemory extends BaseMemory {
  type: "semantic";
  content: string; // The fact or concept (natural language)
  subjects: string[]; // Main topics/entities covered
  predicates: string[]; // Relationships or properties
  objects: string[]; // Related entities or values
  confidence: number; // Confidence in accuracy (0-1)
  sources: MemorySource[]; // Where this information came from
  embedding?: number[]; // Vector embedding
}

interface ProceduralMemory extends BaseMemory {
  type: "procedural";
  skillName: string; // Name of the skill/pattern
  triggerConditions: string[]; // When this skill applies
  procedure: ProcedureStep[]; // Steps to execute
  successRate: number; // Historical success rate (0-1)
  usageContext: {
    entityTypes: ("chat" | "character" | "epic" | "task")[];
    domains: string[]; // Knowledge domains where applicable
  };
}

interface MemorySource {
  type: "observation" | "instruction" | "inference" | "tool_result";
  referenceId: string; // ID of source message/action/tool result
  confidence: number; // Confidence in this source (0-1)
}

interface ProcedureStep {
  step: number;
  action: string; // What to do
  description?: string; // Detailed explanation
  tools?: string[]; // Tools that might be needed
  expectedOutcome?: string; // What should happen after this step
}
```

## Memory Formation

### Episodic Memory Formation

- Automatically created from significant chat/workspace interactions
- Triggered by: message threshold, session end, explicit user request
- Process:
  1. Collect relevant messages from time window
  2. Generate summary highlighting key points
  3. Create embedding for similarity search
  4. Store as asset with appropriate links

### Semantic Memory Formation

- Extracted from episodic memories through analysis
- Process:
  1. Identify facts, concepts, relationships in episodic content
  2. Validate against existing knowledge (consistency checking)
  3. Assign confidence based on source reliability
  4. Store as semantic memory asset
  5. Link to relevant entities (epics, tasks, characters)

### Procedural Memory Formation

- Learned from successful patterns through reinforcement
- Process:
  1. Observe successful goal achievement sequences
  2. Abstract into generalizable procedure
  3. Validate through simulation or testing
  4. Store with initial success rate estimate
  5. Update success rate with each use

## Memory Retrieval

### Retrieval Strategies

1. **Temporal Retrieval** (Episodic)
   - Time-range queries
   - Recency-biased sampling
   - Session boundary detection

2. **Semantic Retrieval** (Semantic & Episodic)
   - Vector similarity search (embeddings)
   - Keyword/phrase matching
   - Concept hierarchy traversal
   - Relationship-based querying

3. **Procedural Retrieval** (Procedural)
   - Pattern matching on trigger conditions
   - Context applicability scoring
   - Success rate weighting
   - Skill chaining for complex goals

### Retrieval API

```typescript
interface MemoryQuery {
  types?: ("episodic" | "semantic" | "procedural")[];
  entityTypes?: ("chat" | "character" | "epic" | "task")[];
  entityIds?: string[];
  timeRange?: { start: Date; end: Date };
  limit?: number;
  offset?: number;
}

interface MemorySearchQuery extends MemoryQuery {
  queryText: string; // Natural language search
  similarityThreshold?: number; // For vector search (0-1)
  includeEmbeddings?: boolean;
}

interface MemoryRetrievalResult {
  memories: BaseMemory[];
  totalCount: number;
  query: MemoryQuery | MemorySearchQuery;
  retrievalTimeMs: number;
}
```

## Memory Maintenance

### Forgetting Curves

- Memories naturally decay over time if not accessed
- Different decay rates by memory type:
  - Episodic: Fast decay (details fade quickly)
  - Semantic: Slow decay (facts persist longer)
  - Procedural: Variable decay (skills decay if not practiced)

### Consolidation

- Related memories can be merged into higher-order constructs
- Redundant information is pruned
- Important memories are strengthened through replay

### Interference Resolution

- Conflicting memories are flagged for resolution
- More recent or higher-confidence memories take precedence
- Users can manually resolve conflicts

## Implementation Details

### Storage Implementation

Memories are stored as assets with specific structure:

```sql
-- assets table (existing)
CREATE TABLE assets (
  id UUID PRIMARY KEY,
  asset_type TEXT NOT NULL, -- 'memory' for our case
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  filename TEXT NOT NULL,
  upload_timestamp TEXT NOT NULL DEFAULT (datetime('now'))  -- ISO 8601
);

-- asset_links table (existing)
CREATE TABLE asset_links (
  id UUID PRIMARY KEY,
  asset_id UUID REFERENCES assets(id),
  entity_type TEXT NOT NULL, -- 'chat', 'character', 'epic', 'task'
  entity_id UUID NOT NULL,
  label TEXT NOT NULL, -- 'episodic', 'semantic', 'procedural'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- For semantic memories with embeddings (optional extension)
CREATE TABLE memory_embeddings (
  asset_id UUID PRIMARY KEY REFERENCES assets(id),
  embedding_vector VECTOR(384), -- Using pgvector extension
  model TEXT NOT NULL, -- Embedding model used
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Memory Service Interface

```typescript
interface MemoryService {
  // Episodic memory
  createEpisodicMemory(params: {
    content: string;
    context: EpisodicMemory["context"];
    embedding?: number[];
  }): Promise<string>; // Returns memory ID

  getEpisodicMemories(query: MemoryQuery): Promise<MemoryRetrievalResult>;

  // Semantic memory
  createSemanticMemory(params: {
    content: string;
    subjects: string[];
    predicates: string[];
    objects: string[];
    confidence: number;
    sources: MemorySource[];
    embedding?: number[];
  }): Promise<string>;

  searchSemanticMemories(query: MemorySearchQuery): Promise<MemoryRetrievalResult>;

  // Procedural memory
  createProceduralMemory(params: Omit<ProceduralMemory, keyof BaseMemory>): Promise<string>;

  getApplicableProcedures(context: {
    entityTypes: ("chat" | "character" | "epic" | "task")[];
    currentGoal?: string;
    recentActions: string[];
  }): Promise<ProceduralMemory[]>;

  // Memory maintenance
  consolidateMemories(entityId: string, entityType: string): Promise<void>;
  decayUnusedMemories(olderThan: Date): Promise<number>; // Returns count decayed
}
```

## Integration Points

### With Agent Runtime

- Agents automatically store significant interactions as episodic memory
- Before acting, agents query relevant semantic/procedural memories
- After actions, agents extract and store learned knowledge
- Memory-informed prompting: include relevant memories in agent context

### With Chat System

- Chat messages can be tagged as memory-worthy
- Automatic summarization of long chats into episodic memories
- Memory links displayed in UI for user awareness
- Users can manually create/edit/delete memories

### With Asset System

- Memories use existing asset upload/storage pipeline
- Benefit from asset versioning, access controls, and backup
- Memory assets can be tagged, searched, and filtered like other assets

### With Plugin System

- Plugins can contribute memory extraction techniques
- Custom memory types can be defined (e.g., 'emotional_memory')
- Memory-based tools for agents (e.g., `recall_fact`, `apply_skill`)

## Security and Privacy

### Access Control

- Memories inherit access controls from linked entities
- Users can mark memories as private (encrypted at rest)
- Memory sharing requires explicit permission
- Audit logging for memory access and modification

### Data Retention

- Configurable retention policies by memory type
- Automatic purging of low-value, old memories
- Export/deletion capabilities for GDPR compliance
- Anonymization options for analytics

## Configuration

```yaml
memory:
  # Storage
  enabled: true
  storageBackend: asset # Uses asset system

  # Episodic memory
  episodic:
    enabled: true
    maxAgeDays: 30
    minMessageCount: 5
    autoSummarize: true
    summaryLength: 200 # words

  # Semantic memory
  semantic:
    enabled: true
    extractionEnabled: true
    confidenceThreshold: 0.7
    deduplicationEnabled: true
    embeddingModel: "sentence-transformers/all-MiniLM-L6-v2"

  # Procedural memory
  procedural:
    enabled: true
    learningEnabled: true
    minSuccessExamples: 3
    decayRate: 0.01 # Per day if unused

  # Maintenance
  maintenance:
    consolidationEnabled: true
    consolidationIntervalHours: 24
    decayEnabled: true
    decayIntervalHours: 6
    interferenceResolution: true
```

## Example Usage

### Research Workflow

1. User asks agent to research "renewable energy policies"
2. Agent performs web searches, stores results as semantic memories
3. Agent extracts key facts: "Germany aims for 80% renewable electricity by 2030"
4. Later, user asks about EU energy policy
5. Agent retrieves relevant semantic memories about renewable energy targets
6. Agent combines memories to provide comprehensive answer

### Coding Assistant

1. User asks agent to debug a Python script
2. Agent executes code, observes error, tries fix
3. Successful fix stored as procedural memory: "Handle NoneType in pandas groupby"
4. Weeks later, similar error occurs
5. Agent recalls procedural memory and applies same fix pattern
6. Success rate of this procedural memory increases

### RPG Character

1. Character interacts with user over multiple sessions
2. Important conversation moments stored as episodic memories
3. User preferences extracted as semantic memories: "User prefers terse responses"
4. Character learns procedural memory: "When user seems frustrated, offer encouragement"
5. Future interactions informed by all three memory types

## Future Extensions

### Memory Types

- **Emotional Memory**: Tag memories with emotional valence
- **Social Memory**: Track relationship dynamics and social contracts
- **Creative Memory**: Store novel combinations and ideas for inspiration

### Advanced Features

- Memory replay during "downtime" for consolidation
- Memory-informed fine-tuning of local models
- Cross-agent memory sharing (with permissions)
- Memory visualization tools for inspection and editing
- Memory-based reward signals for reinforcement learning

### Integration

- With knowledge graphs for richer semantic connections
- With external databases for enterprise knowledge integration
- With version control for tracking memory evolution over time
