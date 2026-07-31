# TASK: AUX LLM — Memory Extraction

**Status:** ⬜ Not Started
**Priority:** P2-B
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux-llm, memory, extraction, actor_memories

## Summary

AUX LLM extracts memorable moments from assistant responses. Runs after
main generation to identify what should be persisted to long-term memory.

## Design

### Input

User message + assistant response (the full exchange).

### System Prompt

```
You are a memory extractor for a roleplay chat. Analyze the exchange
and identify moments worth remembering for future conversations.

Consider: character decisions, relationship changes, world discoveries,
quest progress,物品acquired, promises made, secrets revealed.

Reply with ONLY a JSON object:
{
  "memories": [
    {
      "content": "what happened (max 100 chars)",
      "importance": <1-10>,
      "keywords": ["tag1", "tag2"],
      "scope": "character|world|assistant"
    }
  ]
}

Rules:
- importance 1-3: minor detail (met an NPC, found an item)
- importance 4-6: notable event (made a decision, discovered something)
- importance 7-10: major event (betrayal, quest completion, world change)
- scope "character": about a specific character
- scope "world": about the world/setting
- scope "assistant": meta/system information
- Return empty array if nothing worth remembering
```

### Output

```typescript
interface MemoryExtraction {
  memories: Array<{
    content: string;
    importance: number; // 1-10
    keywords: string[];
    scope: "character" | "world" | "assistant";
  }>;
}
```

### Integration

1. After main generation completes, AUX extracts memories
2. Each memory stored to `actor_memories` table
3. Keywords used for retrieval matching
4. Importance affects promotion priority
5. Side effect (DB writes) happens async — doesn't block response

### Token Budget

| Component          | Tokens    |
| ------------------ | --------- |
| System message     | ~200      |
| User message       | ~200      |
| Assistant response | ~500      |
| **Total input**    | **~900**  |
| Response           | ~200      |
| **Total**          | **~1100** |

## Files to Create

- `src/aux-pipeline/tasks/memory.ts`

## Files to Modify

- `src/aux-pipeline/index.ts` — register memory task
- `src/memory/extraction.ts` — add AUX-triggered extraction

## Acceptance Criteria

- [ ] Memory extraction returns valid JSON
- [ ] Empty array for non-memorable exchanges
- [ ] Memories stored to actor_memories table
- [ ] Keywords set for retrieval
- [ ] Importance within 1-10 range
- [ ] Timeout/error → no memories extracted (graceful)
- [ ] Existing memory tests still pass
