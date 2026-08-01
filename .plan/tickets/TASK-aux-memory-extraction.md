# TASK: AUX LLM — Memory Extraction

**Status:** 🟡 Partial — extraction implemented but wired to MAIN provider with `model: "default"` bug; not on auxiliary role (2026-08-01)
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

## Current State (2026-08-01 review)

| Component                          | Status                                                       | Location                          |
| ---------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Extraction + store                 | ✅ implemented, fire-and-forget after generation              | `src/memory/extraction.ts`        |
| Wiring                            | ⚠️ called with **MAIN resolved provider**, not auxiliary role | `generate-route.ts:524,675`       |
| `model: "default"` literal         | 🔴 `provider.complete({ model: "default", ... } as never)` — `as never` hides type error; most OpenAI-compatible servers reject unknown model → extraction silently no-ops | `src/memory/extraction.ts:60` |
| `ExtractionOpts.modelId`           | ❌ dead field, never read                                     | `src/memory/types.ts`             |
| Duplicate `db` param               | 🟢 `database` + `{ db: database }` passed twice               | `generate-route.ts:524`           |
| Provider keys                     | ❌ no apiKey (relies on provider instance key)                | —                                 |
| Telemetry                         | ❌ not recorded                                               | —                                 |

## Next Actionable Items

1. **Fix `model: "default"` bug** (epic M2 — quick win): pass
   `resolved.resolvedModel` from the call site; drop the `as never` cast;
   delete dead `ExtractionOpts.modelId`; drop duplicate `db` param.
2. **Move to auxiliary role**: extract on the auxiliary model via the shared
   runner (M1) so main-generation tokens/latency aren't consumed by memory
   work; keep fire-and-forget semantics.
3. **BYO-key parity**: resolve apiKey via `resolveProvider` when calling AUX.
4. **Scope/importance alignment**: current prompt returns flat array
   (no `scope`); ticket design wants `scope: character|world|assistant` +
   importance-aware promotion. Extend schema + `storeMemories` when
   `character_mood`/world memory integration lands.
5. **Tests**: add unit test that a non-JSON/prose-wrapped response yields `[]`
   (parser already handles fences); integration test that extraction writes
   `actor_memories` with dedup.

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
