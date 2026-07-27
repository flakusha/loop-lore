# Chat Mode Reconciliation

**Status:** Design
**Created:** 2026-07-28
**Gap:** Three orthogonal axes (participant structure, behavioral mode, response style) conflated into one field

## Problem

The chat settings system has **three separate concepts** all fighting for the same `mode` field:

### Axis 1: Participant Structure (who's in the chat)

- `ChatType` enum already exists: `"direct"` | `"group"`
- This is correctly implemented and used

### Axis 2: Behavioral/Orchestration Mode (how the chat behaves)

- `ChatMode` enum exists but is corrupted: `"direct"` | `"group"` | `"story"`
- `"direct"` and `"group"` are **ChatType values leaking into ChatMode** — they don't belong here
- `"story"` is the only real behavioral mode
- Worlds-extension epic proposes: `"normal"` | `"battle"` | `"question"` | `"inventory"`
- These are **orthogonal to ChatType** — a direct chat CAN be in battle mode

### Axis 3: Response Style (how the LLM generates)

- overview.md calls them: Short / Default / Detailed
- TASK-response-length-control calls them: Short / Medium / Long / Custom
- Same feature, different naming, not implemented

### The Live Bug

`chat-settings-modal.html` offers `<option value="chat">` and `<option value="roleplay">` — **neither is a valid DB value**. The frontend sends `"chat"` or `"roleplay"` as `mode`, but the backend expects `"direct"`, `"group"`, or `"story"`. This is a silent data corruption bug.

## Reconciliation Design

### Three Separate Fields

```typescript
// Axis 1: Participant structure (already correct in DB)
type ChatType = "direct" | "group";

// Axis 2: Behavioral/orchestration mode (fix ChatMode)
type ChatMode = "story" | "battle" | "question" | "inventory";

// Axis 3: Response style (new field)
type ResponseStyle = "short" | "default" | "detailed" | "custom";
```

### Why This Separation

| Chat | ChatType | ChatMode | ResponseStyle | Example |
|---|---|---|---|---|
| 1:1 literary RP | `direct` | `story` | `detailed` | Long literary exchanges with a single character |
| Quick DM combat | `direct` | `battle` | `short` | Fast attack/defend with GM |
| Party dungeon crawl | `group` | `battle` | `short` | Quick tactical combat with party |
| Group quest planning | `group` | `question` | `default` | Normal conversation with party |
| Solo inventory management | `direct` | `inventory` | `default` | Browsing items, crafting |

### DB Migration

Extend `chats` table with one new column:

```sql
ALTER TABLE chats ADD COLUMN response_style TEXT DEFAULT 'default'
  CHECK (response_style IN ('short', 'default', 'detailed', 'custom'));
ALTER TABLE chats ADD COLUMN response_style_custom INTEGER DEFAULT NULL;
```

### ChatMode Enum Fix

```typescript
// BEFORE (broken)
export const ChatMode = {
  Direct: "direct",  // ← belongs in ChatType
  Group: "group",    // ← belongs in ChatType
  Story: "story",
} as const;

// AFTER (correct)
export const ChatMode = {
  Story: "story",
  Battle: "battle",
  Question: "question",
  Inventory: "inventory",
} as const;
```

**Migration note:** Any existing chats with `mode = 'direct'` or `mode = 'group'` should be migrated to `mode = 'story'` (the default behavioral mode). The `type` field already captures participant structure.

### UI Changes

#### Chat Settings Modal

Replace the single mode selector with three independent controls:

```html
<!-- Axis 1: Chat Type (read-only, set at creation) -->
<div class="form-group">
  <label class="form-label">Chat Type</label>
  <span x-text="currentChat?.type === 'group' ? 'Group' : 'Direct'" class="badge"></span>
  <small>Set when chat is created</small>
</div>

<!-- Axis 2: Behavioral Mode -->
<div class="form-group">
  <label class="form-label" for="settings-chat-mode">Mode</label>
  <select class="form-input" id="settings-chat-mode" x-model="_chatSettingsMode">
    <option value="story">Story (standard RP)</option>
    <option value="battle">Battle (fast tactical)</option>
    <option value="question">Question (Q&A focused)</option>
    <option value="inventory">Inventory (item management)</option>
  </select>
</div>

<!-- Axis 3: Response Style -->
<div class="form-group">
  <label class="form-label" for="settings-response-style">Response Style</label>
  <select class="form-input" id="settings-response-style" x-model="_responseStyle">
    <option value="short">Short (1-2 paragraphs)</option>
    <option value="default">Default (balanced)</option>
    <option value="detailed">Detailed (long-form)</option>
    <option value="custom">Custom</option>
  </select>
  <div x-show="_responseStyle === 'custom'" class="form-group">
    <label>Custom length: <span x-text="_responseStyleCustom"></span> tokens</label>
    <input type="range" min="50" max="2000" step="50"
           x-model.number="_responseStyleCustom" />
  </div>
</div>
```

### Prompt Assembly Integration

The `response_style` maps to generation instructions:

```typescript
const RESPONSE_STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  short: "Keep responses to 1-2 paragraphs. Focus on action and dialogue. Minimize description.",
  default: "Write balanced responses mixing description and dialogue. 1-5 paragraphs.",
  detailed: "Write rich, detailed responses with deep character immersion. Long-form narration.",
  custom: "", // Uses max_tokens from response_style_custom
};
```

These get appended to the system prompt, separate from ChatMode instructions.

### ChatMode Prompt Integration

Each mode adds behavioral instructions:

```typescript
const MODE_INSTRUCTIONS: Record<ChatMode, string> = {
  story: "", // Default — no special instructions
  battle: "This is a combat encounter. Keep descriptions tight. Prioritize action sequences. Use initiative-based turn order.",
  question: "This is a Q&A focused chat. Answer questions directly. Minimize narrative filler.",
  inventory: "This is an inventory/item management session. Describe items clearly. Focus on stats and effects.",
};
```

## Files to Modify

### Critical (Live Bug Fix)

- `src/db/enums-core.ts` — Fix ChatMode enum (remove "direct"/"group", add "battle"/"question"/"inventory")
- `src/components/chat/chat-settings-modal.html` — Fix mode options, add response style selector
- `src/frontend/alpine/chat-settings.ts` — Fix default mode, add response style state

### Schema

- `src/db/migrations/008_chat_features.ts` — Add `response_style` and `response_style_custom` columns (in-place)
- `src/db/schema-core.ts` — Add columns to chats table type
- `src/validation/schemas.ts` — Update ChatModeSchema, add ResponseStyleSchema

### Generation

- `src/assistant/prompt-assembler.ts` — Inject mode + style instructions into system prompt
- `src/generation/auto-gen.ts` — Pass resolved max_tokens from response_style_custom

### Documentation

- `docs/frontend/chat/overview.md` — Update Generation Style Presets section (use "response style" terminology)
- `docs/frontend/chat/group-chat.md` — Update mode descriptions
- `.plan/tickets/TASK-response-length-control.md` — Mark as superseded by this design

### Cleanup

- `.plan/epics/epic-worlds-extension.md` — Update ChatMode references to match new enum
- `.plan/tickets/TASK-response-length-control.md` — Superseded, point to this design

## Migration Strategy

1. **Phase 1: Fix the bug** — Update ChatMode enum, fix UI options, add migration for existing data
2. **Phase 2: Add response style** — New column, UI selector, prompt integration
3. **Phase 3: Wire modes** — Battle/question/inventory mode instructions in prompt assembler

## Open Questions

1. **Should ChatMode be per-chat or per-message?** — Current design is per-chat (changes affect future messages). Could be per-message for battle mode that only lasts one exchange.

2. **Mode transitions** — Can a chat switch from `story` to `battle` mid-conversation? Yes — the mode affects generation, not state. Switching is safe.

3. **Response style vs max_tokens** — Should `custom` style use `response_style_custom` as max_tokens, or should it be a multiplier? Recommendation: direct max_tokens for simplicity.
