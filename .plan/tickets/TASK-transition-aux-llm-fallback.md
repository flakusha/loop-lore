# TASK: AUX LLM Fallback for Transition Intent Detection

**Status:** ⬜ Not Started
**Priority:** P2-B
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** transition, detection, aux-llm, classification, intent

## Summary

Add AUX LLM fallback for transition detection when regex patterns miss.
Regex covers explicit movement ("I walk to..."), but misses implicit or
narrative transitions ("The rain forces us to seek shelter",
"We have no choice but to enter the cave").

## Problem

Current regex patterns in `src/regex/transitions.ts`:

| Pattern               | Catches                     | Misses                        |
| --------------------- | --------------------------- | ----------------------------- |
| `MOVEMENT_VERBS`      | "I walk to X", "We go to X" | "We're forced inside"         |
| `SCENE_CHANGE`        | "The scene shifts"          | "The world changes around us" |
| `TRANSITION_PHRASES`  | "Let's go to X"             | "We should probably head out" |
| `TEMPORAL_TRANSITION` | "After a while..."          | "Hours pass as we travel"     |
| `CONTEXT_CUT`         | "Context cut"               | "Skip to the next morning"    |

Edge cases regex misses:

- **Implied movement**: "The rain forces us to seek shelter"
- **NPC-driven**: "The guard escorts you to the dungeon"
- **Environmental**: "The bridge collapses, washing us downstream"
- **Choice-driven**: "We take the left path" (no movement verb)
- **Narrative**: "The scene fades to black. We're now in the tavern."

## Design

### Architecture: Regex-First, AUX-LLM-Fallback

```
User message
  ↓
Regex check (instant, zero cost)
  ↓
Match? → YES → Transition detected
  ↓ NO
AUX LLM check (fast, low cost)
  ↓
Match? → YES → Transition detected
  ↓ NO
No transition
```

### AUX LLM Constraints

| Parameter           | Value                        | Rationale                            |
| ------------------- | ---------------------------- | ------------------------------------ |
| **Model**           | `auxiliary` role from config | Uses existing model role assignment  |
| **Context**         | Last 1-2 messages only       | Minimize tokens, fast classification |
| **Max tokens**      | 50-100                       | JSON response only, no prose         |
| **Temperature**     | 0.0                          | Deterministic classification         |
| **Timeout**         | 2000ms                       | Fail fast, don't block chat          |
| **Fallback**        | No transition                | Graceful degradation on error        |
| **Response format** | JSON only                    | Structured, parseable                |

### System Message

```
You are a transition detector. Analyze whether the user message
narrates a scene/location change in a roleplay chat.

Reply with ONLY a JSON object:
{
  "isTransition": true/false,
  "type": "location_change" | "context_cut" | "description" | null,
  "confidence": 0.0-1.0,
  "locationHint": "extracted location name or null"
}

Rules:
- "location_change" = character moves to a new place
- "context_cut" = time skip or scene break
- "description" = narrative transition without explicit movement
- null = not a transition

Examples:
- "I walk to the tavern" → isTransition: true, type: "location_change"
- "The rain forces us inside" → isTransition: true, type: "location_change"
- "Skip to morning" → isTransition: true, type: "context_cut"
- "I draw my sword" → isTransition: false
- "Tell me about the quest" → isTransition: false
```

### Implementation

New file: `src/chat/transition-classifier.ts`

```typescript
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { resolveModelRole, } from "../generation/auto-gen";
import { getProvider, } from "../generation/providers/registry";
import { getLogger, } from "../logger";
import {
  CONTEXT_CUT,
  MOVEMENT_VERBS,
  SCENE_CHANGE,
  TEMPORAL_TRANSITION,
  TRANSITION_PHRASES,
} from "../regex/transitions";

export interface TransitionClassification {
  isTransition: boolean;
  type: "location_change" | "context_cut" | "description" | null;
  confidence: number;
  locationHint: string | null;
  source: "regex" | "aux-llm" | "none";
}

// Regex patterns for fast detection
const REGEX_PATTERNS = [
  { pattern: MOVEMENT_VERBS, type: "location_change" as const, },
  { pattern: SCENE_CHANGE, type: "location_change" as const, },
  { pattern: TRANSITION_PHRASES, type: "location_change" as const, },
  { pattern: TEMPORAL_TRANSITION, type: "description" as const, },
  { pattern: CONTEXT_CUT, type: "context_cut" as const, },
];

/**
 * Classify whether a message is a transition.
 * Regex-first, AUX-LLM-fallback for missed cases.
 */
export async function classifyTransition(
  content: string,
  recentMessages: string[], // last 1-2 messages for context
  config: Config,
  db: Kysely<DB>,
): Promise<TransitionClassification> {
  // Step 1: Regex check (instant, zero cost)
  const lower = content.toLowerCase();
  for (const { pattern, type, } of REGEX_PATTERNS) {
    if (pattern.test(lower,)) {
      return {
        isTransition: true,
        type,
        confidence: 1.0,
        locationHint: extractLocationHint(content,),
        source: "regex",
      };
    }
  }

  // Step 2: AUX LLM fallback (fast, low cost)
  try {
    const classification = await auxLlmClassify(content, recentMessages, config, db,);
    if (classification) {
      return { ...classification, source: "aux-llm", };
    }
  } catch {
    // AUX unavailable — proceed with no transition
  }

  // Step 3: No transition detected
  return {
    isTransition: false,
    type: null,
    confidence: 0,
    locationHint: null,
    source: "none",
  };
}

/**
 * AUX LLM classification with fast-resolution constraints.
 */
async function auxLlmClassify(
  content: string,
  recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
): Promise<Omit<TransitionClassification, "source"> | null> {
  const auxRole = await resolveModelRole("auxiliary", config, db,);
  if (!auxRole.provider || !auxRole.model) { return null; }

  const provider = getProvider(auxRole.provider,);
  if (!provider) { return null; }

  // Build minimal context: system + recent messages + current message
  const contextBlock = recentMessages.length > 0
    ? `\nRecent context:\n${recentMessages.map(m => `- ${m.slice(0, 200,)}`).join("\n",)}\n`
    : "";

  const messages = [
    { role: "system" as const, content: TRANSITION_CLASSIFIER_PROMPT, },
    ...recentMessages.map(m => ({
      role: "user" as const,
      content: m.slice(0, 200,),
    })),
    { role: "user" as const, content, },
  ];

  const response = await provider.complete({
    model: auxRole.model,
    messages,
    params: {
      temperature: 0.0,
      maxTokens: 100,
    },
  },);

  const parsed = jsonParseOr<{
    isTransition?: boolean;
    type?: string;
    confidence?: number;
    locationHint?: string;
  }>(response.content, {},);

  if (!parsed || typeof parsed.isTransition !== "boolean") { return null; }

  return {
    isTransition: parsed.isTransition,
    type: isValidTransitionType(parsed.type,) ? parsed.type : null,
    confidence: parsed.confidence ?? 0.5,
    locationHint: parsed.locationHint ?? null,
  };
}

// Helpers
function isValidTransitionType(t: unknown,): t is "location_change" | "context_cut" | "description" {
  return t === "location_change" || t === "context_cut" || t === "description";
}

function extractLocationHint(content: string,): string | null {
  // Simple heuristic: extract text after movement prepositions
  const match = content.match(/(?:to|into|toward|inside|outside)\s+(.+?)(?:\.|,|$)/i,);
  return match?.[1]?.trim() ?? null;
}

function jsonParseOr<T,>(text: string, fallback: T,): T {
  try {
    return JSON.parse(text,) as T;
  } catch {
    return fallback;
  }
}
```

### Wiring Into Message Pipeline

The classifier integrates into the existing `isTransitionMessage` call site.
Currently `isTransitionMessage` is used in `chat/transitions.ts` but the
actual call happens in the message creation flow.

Wire point: Before creating a message, if regex says "no transition",
call `classifyTransition()` with the AUX LLM. If it says "yes", proceed
with transition handling.

### Error Handling & Timeout

```typescript
// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return null;  // Fail fast, no transition
  }
}

// Usage in auxLlmClassify:
const response = await withTimeout(
  provider.complete({ ... }),
  2000,  // 2 second timeout
);
if (!response) return null;  // Timeout → no transition
```

### Fallback Behavior

| Failure Mode                      | Behavior                       |
| --------------------------------- | ------------------------------ |
| No AUX model configured           | Skip AUX, return no transition |
| AUX provider unavailable          | Skip AUX, return no transition |
| AUX timeout (>2s)                 | Return no transition           |
| AUX returns invalid JSON          | Return no transition           |
| AUX returns low confidence (<0.5) | Return no transition           |
| AUX error/exception               | Return no transition           |

### Token Budget

| Component             | Tokens   |
| --------------------- | -------- |
| System message        | ~200     |
| Recent messages (1-2) | ~400     |
| Current message       | ~200     |
| **Total input**       | **~800** |
| Response              | ~100     |
| **Total**             | **~900** |

At ~$0.0001 per call (GPT-4o-mini), this is negligible.

## Files to Create

- `src/chat/transition-classifier.ts` — classifier with regex + AUX LLM

## Files to Modify

- `src/chat/transitions.ts` — wire classifier into `isTransitionMessage`
- `src/chat/types.ts` — add `TransitionClassification` type

## Tests

- [ ] Regex detection still works for all existing patterns
- [ ] AUX LLM triggers when regex misses
- [ ] AUX LLM timeout returns no transition
- [ ] AUX LLM error returns no transition
- [ ] AUX LLM low confidence returns no transition
- [ ] No AUX model configured → graceful skip
- [ ] Location hint extraction works
- [ ] Total latency < 3s (regex + AUX)

## Verification

```bash
bun run check
bun test src/chat/
bun test src/regex/transitions.test.ts
```
