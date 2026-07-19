# Lore Consistency Checker Implementation

## Overview

LLM-based validation of generated content against known world lore, characters, and facts.

## Implementation

### File: src/story/lore-checker.ts

```typescript
export interface LoreViolation {
  type: "character" | "location" | "item" | "fact";
  message: string;
  severity: "warning" | "error";
  suggestion?: string;
}

export async function checkLoreConsistency(
  content: string,
  worldId: string,
  context: { actorIds: string[]; locationId?: string },
): Promise<LoreViolation[]> {
  const violations: LoreViolation[] = [];

  // Get world lore
  const lore = await db
    .selectFrom("world_lore_entries",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("status", "=", "enabled",)
    .execute();

  // Get character facts
  const characterFacts = await db
    .selectFrom("actor_lore_entries",)
    .selectAll()
    .where("actor_id", "in", context.actorIds,)
    .execute();

  // Build lore prompt
  const lorePrompt = `
You are a lore consistency checker. Analyze the following text for violations:

TEXT: ${content}

KNOWN FACTS:
${lore.map((l,) => `- ${l.key}: ${l.content}`).join("\n",)}
${characterFacts.map((f,) => `- ${f.key}: ${f.content}`).join("\n",)}

Return JSON array of violations:
[]
or
[{"type": "character", "message": "Character said X but lore says Y", "severity": "warning", "suggestion": "Change to Y"}]
`;

  const response = await llmGenerate({
    messages: [{ role: "user", content: lorePrompt, },],
    json: true,
    temperature: 0.1, // Deterministic
  },);

  return JSON.parse(response,);
}
```

### Integration with Generation Pipeline

```typescript
// src/generation/generate-route.ts
const result = await llmGenerate(params,);

if (chat.mode === "story" || world.has_lore_checker) {
  const violations = await checkLoreConsistency(result.content, chat.world_id, {
    actorIds: participants.map((p,) => p.actor_id),
  },);

  if (violations.some((v,) => v.severity === "error")) {
    // Trigger regeneration or GM escalation
    return regenerateWithCorrection(violations,);
  }

  // Inject violations into prompt for next turn
  if (violations.length > 0) {
    result.lore_violations = violations;
  }
}
```

### UI Integration

```typescript
// In message display
<div x-show="message.lore_violations?.length" class="lore-warnings">
  <template x-for="v in message.lore_violations" :key="v.message">
    <div class="warning-item" :class="v.severity">
      <span>⚠️ Lore warning: <span x-text="v.message"></span></span>
    </div>
  </template>
</div>
```

## Edge Cases

- LLM returns invalid JSON → empty violations array
- Too many facts → chunk and prioritize
- Contradictory lore → flag for GM review
- Performance impact → cache lore embeddings
- False positives → user can dismiss, learns from feedback

## Configuration

Per-world setting:

```json
{
  "lore_checker": {
    "enabled": true,
    "severity_threshold": "warning",
    "auto_correct": false
  }
}
```

## Model Comparison Integration

Violations can be compared:

- Which model produces fewer lore violations?
- Which model corrects more accurately?
- Store in `model_comparisons` with `lore_accuracy` metric
