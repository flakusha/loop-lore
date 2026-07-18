# Creative Studio Extension

## Overview

Extended assistant capabilities for content creation, document analysis, and RPG item generation.

## /improve Command

### Implementation
```typescript
// src/assistant/commands/improve.ts
export async function improveText(
  text: string,
  context: { chatId: string; actorId: string; worldId: string }
): Promise<{ original: string; improved: string; suggestions: string[] }> {
  const prompt = `
Improve the following text for clarity, grammar, and style:
"${text}"

Return JSON:
{
  "improved": "the improved text",
  "suggestions": ["suggestion 1", "suggestion 2"]
}
`;

  const response = await llmGenerate({
    messages: [{ role: "user", content: prompt }],
    json: true,
    temperature: 0.3,
  });

  return JSON.parse(response);
}
```

### Edge Cases
- Empty text → "Nothing to improve"
- Text > 10KB → truncate with warning
- LLM returns invalid JSON → fallback to text
- Sensitive content in text → mask before sending to LLM

## /image Command

### Implementation
```typescript
// src/assistant/commands/image.ts
export async function generateImage(
  prompt: string,
  options: { style?: string; width?: number; height?: number }
): Promise<{ assetId: string; url: string }> {
  const fullPrompt = options.style
    ? `${prompt}, style: ${options.style}`
    : prompt;

  const result = await imageProvider.generate({
    prompt: fullPrompt,
    width: options.width ?? 512,
    height: options.height ?? 512,
  });

  // Save to assets table
  const assetId = await saveAsset({
    chat_id: context.chatId,
    url: result.url,
    type: "image",
    metadata: { prompt, style: options.style },
  });

  return { assetId, url: result.url };
}
```

### Edge Cases
- NSFW prompt → profanity filter check
- Image generation fails → toast error
- Cost exceeds user balance → reject
- Rate limit hit → queue with ETA

## Document Analysis (RAG-style)

### Implementation
```typescript
// src/assistant/commands/analyze.ts
export async function analyzeDocument(
  assetId: string,
  query: string
): Promise<{ summary: string; relevantSections: string[] }> {
  // Load document content
  const content = await extractTextFromAsset(assetId);

  // Chunk for LLM
  const chunks = chunkDocument(content, 2000);

  // Find relevant chunks
  const relevant = await findRelevantChunks(chunks, query);

  const prompt = `
Document: ${relevant.join("\n\n")}
Question: ${query}

Summarize and answer.
`;

  return llmGenerate({ messages: [{ role: "user", content: prompt }] });
}
```

### Edge Cases
- PDF extraction fails → error with file type
- Document > 100 pages → summarize first
- No relevant sections found → "Document doesn't contain relevant info"
- Query in different language → translate first

## RPG Item Generation

### Implementation
```typescript
// src/assistant/commands/generate-item.ts
export async function generateItem(
  type: string,
  context: { worldId: string; actorId: string }
): Promise<Item> {
  const worldRules = await getWorldRules(context.worldId);

  const prompt = `
Generate a ${type} for a fantasy RPG.

World rules: ${JSON.stringify(worldRules.item_templates)}

Return JSON:
{
  "name": "Item name",
  "description": "Flavor text",
  "stats": { "damage": "1d8", "weight": 5 },
  "rarity": "uncommon"
}
`;

  const result = await llmGenerate({ messages: [{ role: "user", content: prompt }], json: true });
  const item = JSON.parse(result);

  // Validate against world rules
  if (!isValidItem(item, worldRules)) {
    throw new Error("Generated item violates world rules");
  }

  return item;
}
```

### Edge Cases
- LLM ignores world rules → validate and retry
- Item too powerful → cap at world max
- Duplicate name → append suffix
- No template matches → use default

## Command Autocomplete

### Implementation
```typescript
// src/frontend/components/command-autocomplete.html
<div x-data="commandAutocomplete()" class="command-dropdown">
  <template x-for="cmd in matchingCommands" :key="cmd.name">
    <div x-on:click="selectCommand(cmd)" class="command-option">
      <span class="command-name">/{{ cmd.name }}</span>
      <span class="command-desc">{{ cmd.description }}</span>
    </div>
  </template>
</div>
```

### Edge Cases
- No matching commands → hide dropdown
- Too many matches (>20) → show first 20
- Special characters in command → escape
- Keyboard navigation → arrow keys, enter
- Mouse click outside → close dropdown