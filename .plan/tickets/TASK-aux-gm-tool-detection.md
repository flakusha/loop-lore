# TASK: AUX LLM — GM Tool Detection

**Status:** 🟡 Partial — detection module + prompt + types + tests shipped (worktree `assistant-intent-workflows`, `fac4c45d`); not yet wired into the command dispatch pipeline (2026-08-16)
**Priority:** P2-C (deferred)
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux-llm, gm, tool, assistant, command

## Summary

AUX LLM detects when user requests GM tool execution in GM-mode chats.
Feeds into the assistant command execution pipeline.

## Design

### Input

User message + chat GM config.

### System Prompt

```
You are a GM tool detector for a roleplay chat. The user may request
the GM to execute a tool or action.

Available GM tools:
- "roll_dice": roll dice for an action
- "check_stats": check character statistics
- "generate_npc": create a new NPC
- "generate_item": create a new item
- "modify_world": change world state
- "trigger_event": trigger a world event
- "summarize": summarize recent events
- "none": no tool requested

Reply with ONLY a JSON object:
{
  "toolCall": {
    "name": "tool_name|none",
    "params": {},
    "confidence": <0.0-1.0>
  }
}

Rules:
- name "none" means no GM tool requested
- params should include relevant parameters (target, value, etc.)
- confidence < 0.5 means uncertain
```

### Output

```typescript
interface GMToolDetection {
  toolCall: {
    name: string;
    params: Record<string, unknown>;
    confidence: number;
  };
}
```

### Integration

1. AUX detects GM tool request
2. If confidence >= 0.7, queue tool execution
3. Tool execution happens async (may need user confirmation)
4. Tool results posted as system message
5. Only active in GM-mode chats (`gm_config.assistantRole === "gm"`)

### Example Messages

| Message                        | Detected Tool                                            |
| ------------------------------ | -------------------------------------------------------- |
| "Roll a d20 for the attack"    | `{ name: "roll_dice", params: { sides: 20 } }`           |
| "What are the goblin's stats?" | `{ name: "check_stats", params: { target: "goblin" } }`  |
| "Create a merchant NPC"        | `{ name: "generate_npc", params: { type: "merchant" } }` |
| "Summarize what happened"      | `{ name: "summarize", params: {} }`                      |
| "I attack the dragon"          | `{ name: "none" }` (user action, not GM tool)            |

## Files to Create

- `src/aux-pipeline/tasks/gm-tool.ts`

## Files to Modify

- `src/aux-pipeline/index.ts` — register GM tool task
- `src/assistant/commands/` — add AUX-triggered tool execution

## Acceptance Criteria

- [ ] Tool detection returns valid JSON
- [ ] Only runs in GM-mode chats
- [ ] High-confidence detections queue tool execution
- [ ] Tool results posted as system message
- [ ] Timeout/error → no tool detection (graceful)
- [ ] Existing GM flow tests still pass
