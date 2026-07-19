# Regex Output Transforms Implementation

## Overview

Pure frontend feature to transform model output at render time. No backend changes required.

## Implementation

### File: src/frontend/alpine/output-transforms.ts

```typescript
export interface TransformRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  flags?: "g" | "gi" | "gi" | "";
  enabled: boolean;
}

export class OutputTransformEngine {
  private rules: TransformRule[] = [];

  addRule(rule: TransformRule): void {
    this.rules.push(rule);
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  transform(text: string): string {
    let result = text;
    for (const rule of this.rules.filter((r) => r.enabled)) {
      try {
        const regex = new RegExp(rule.pattern, rule.flags || "");
        result = result.replace(regex, rule.replacement);
      } catch (e) {
        console.warn(`Invalid regex in rule ${rule.id}:`, e);
      }
    }
    return result;
  }
}

// Built-in rules
const defaultRules: TransformRule[] = [
  {
    id: "strip-actions",
    name: "Strip *actions*",
    pattern: "\\*[\\w\\s]+\\*",
    replacement: "",
    flags: "g",
    enabled: false,
  },
  {
    id: "narration-color",
    name: "Color narration",
    pattern: ">([\\w\\s]+)<",
    replacement: "<span class=\"narration\">$1</span>",
    enabled: false,
  },
  {
    id: "collapse-whitespace",
    name: "Collapse whitespace",
    pattern: "\\n{3,}",
    replacement: "\n\n",
    flags: "g",
    enabled: true,
  },
];
```

### File: src/components/output-transformer.html

```html
<div x-data="outputTransformer()" class="transform-controls">
  <button @click="showRules = !showRules">⚙️ Transforms</button>

  <div x-show="showRules" class="transform-panel">
    <template x-for="rule in rules" :key="rule.id">
      <label class="rule-item">
        <input type="checkbox" x-model="rule.enabled" />
        <span x-text="rule.name"></span>
      </label>
    </template>

    <button @click="addRule">Add Custom Rule</button>
  </div>
</div>
```

### Integration with Message Rendering

```typescript
// In message rendering pipeline
const transformedContent = transformEngine.transform(rawMessage.content);
// Then pass to markdown renderer
```

## Edge Cases

- Invalid regex → catch error, log warning, skip rule
- Regex DOS (catastrophic backtracking) → timeout 100ms
- Replacement contains $ → escape properly
- Rule order matters → allow drag-reorder
- Export/import rules → JSON format

## User Storage

Rules stored in `user.settings.output_transforms` JSON:

```json
{
  "rules": [
    { "id": "strip-actions", "enabled": true },
    { "id": "custom-1", "pattern": "/\\b(foo)\\b/g", "replacement": "bar", "enabled": true }
  ]
}
```

## Security

- No arbitrary code execution
- Regex only, no JS injection
- User input sanitized before storage
