# FEAT-065-LLM: LLM Prompt Template System

**Epic:** epic-items

**Status**: open
**Priority**: high
**Labels**: generation, llm, prompts, templates
**Assignee**:
**Epic**: EPIC-38 (Output Control & Transforms)
**Parent**: FEAT-065 (Prompt Library)
**Related**: FEAT-063 (Regex output transforms), FEAT-064 (Smart-regen polish)

---

## Description

Extend the hardcoded `PromptAssembler` section system (`src/assistant/prompt-assembler.ts`) into a user-configurable, persistable LLM prompt template system. Users define prompt templates with variables; actors/chats can reference a template override.

### Current State

- `src/assistant/prompt-assembler.ts` — 13 hardcoded sections in `src/assistant/prompt/registry.ts`
- No user override; sections are code-fixed
- Token budget trimming drops low-priority sections when over limit

### Why Separate from Image Templates

LLM prompts are **multi-section conversational** (system + context + history). Image prompts are **single-shot descriptive** (tags/natural/JSON). Different construction logic, different variables, different limits.

---

## Scope

### Template Schema

```typescript
interface LlmPromptTemplate {
  id: string;
  ownerId: string;
  name: string;
  // Ordered sections, each with role + content + enabled flag
  sections: LlmTemplateSection[];
  variables: Record<string, string>; // default values
  detailLevel: "instant" | "balanced" | "detailed";
  isPreset: boolean; // built-in vs user-created
}

interface LlmTemplateSection {
  identifier: string; // "system", "actor-header", "lore", etc.
  role: "system" | "user" | "assistant" | "marker";
  content: string; // may contain {{variables}}
  isSystem: boolean;
  isMarker: boolean; // XML delimiter for injection resistance
  enabled: boolean;
  priority: number; // for token-budget trimming (higher = dropped first)
}
```

### Variables

| Variable              | Source                                  | Example                       |
| --------------------- | --------------------------------------- | ----------------------------- |
| `{{charName}}`        | actors.display_name                     | "Aria"                        |
| `{{charDescription}}` | actors.description                      | "A skilled elven archer..."   |
| `{{userDescription}}` | user persona / actors (user)            | "A weary traveler"            |
| `{{chatHistory}}`     | messages (latest N)                     | "Aria: Hello!\nUser: Hi"      |
| `{{sceneSummary}}`    | chats.world_id → location_states        | "Forest clearing at dusk"     |
| `{{loreEntries}}`     | actor_lore_entries + world_lore_entries | "The ancient pact..."         |
| `{{memories}}`        | actor_memories (semantic)               | "- Fought dragon"             |
| `{{postHistory}}`     | actors.post_history_instructions        | "Always respond in character" |
| `{{examples}}`        | actors.mes_example                      | "Aria: _draws bow_"           |

### Preset Library (built-in)

| Preset      | Use Case         | Sections                                                         |
| ----------- | ---------------- | ---------------------------------------------------------------- |
| `roleplay`  | Character chat   | system, actor-header, lore, memory, post-history, chat-history   |
| `assistant` | Assistant mode   | system (ASSISTANT_SYSTEM_PROMPT), user-persona, chat-history     |
| `story-gm`  | RPG turn         | system, actor-header, story-context, recent-events, chat-history |
| `code`      | Code gen         | system (code instructions), chat-history                         |
| `creative`  | Creative writing | system, actor-header, examples, chat-history                     |

### API

- [ ] `POST /api/templates/llm` — create template
- [ ] `GET /api/templates/llm` — list (owner + presets)
- [ ] `GET /api/templates/llm/:id` — retrieve
- [ ] `PATCH /api/templates/llm/:id` — update
- [ ] `DELETE /api/templates/llm/:id` — delete
- [ ] `POST /api/templates/llm/:id/render` — render with context (actorId, chatId)

### Wiring

- [ ] `actors.settings.prompt_template_id` — per-actor override
- [ ] `chats.settings.prompt_template_id` — per-chat override
- [ ] `PromptAssembler.assemble()` checks for template override before using hardcoded sections

---


## Linked Epics

- `epic-items.md`

## Acceptance Criteria

- [ ] User can create LLM prompt template with ordered sections + variables
- [ ] Template renders with `{{variables}}` substituted from actor/chat context
- [ ] Actor override (`actors.settings.prompt_template_id`) takes precedence over hardcoded sections
- [ ] Chat override (`chats.settings.prompt_template_id`) takes precedence over actor
- [ ] 5 built-in presets available
- [ ] Token budget trimming respects section `priority`
- [ ] Unit tests: template CRUD, render, variable substitution, override resolution

---

## Notes

### Files to Touch

- `src/db/migrations/0XX_prompt_templates.ts` — new table
- `src/db/schema-generation.ts` — table types
- `src/generation/template-service.ts` — CRUD + render (new)
- `src/routes/templates.ts` — API routes (new)
- `src/assistant/prompt-assembler.ts` — override check
- `src/assistant/prompt/registry.ts` — preset definitions
- `src/validation/schemas.ts` — request validation

### Reference

- `docs/frontend/chat/prompt-creation.md` — assembly order, section details
- `docs/spec/integrations/llm-serving.md` — prompt template structure (SillyTavern-inspired)
- `src/generation/prompt-templates.ts` — image template pattern to mirror
