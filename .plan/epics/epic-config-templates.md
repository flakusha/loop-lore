# Epic: Configurable Template System

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Large
**Type:** Feature Epic / Configuration
**Tags:** llm, sd, avatar, image-edit, templates, yaml, merge
**Proposed Epic Branch:** epic/config-templates
**Depends on:** existing config loader, prompt templates, template registry

---

## Current State (2026-08-03)

| Phase | Domain | State |
| --- | --- | --- |
| Phase 1 — Template Config Loader | types + loader + merge + wiring | ✅ Shipped (`src/config/sections/templates.ts`, `src/config/templates-loader.ts`, wired via `load.ts:517`) |
| Phase 2 — SD Templates | config-driven profiles | ✅ Loader + config surface shipped; consumption via `generation/prompt-templates.ts` |
| Phase 3 — Avatar Templates | emotion config + intent patterns | ✅ Loader + config surface shipped; expansion via `config/template-expansion.ts` |
| Phase 4 — LLM Integration | system prompts + registry | ✅ **Shipped** — `LLM_PROMPT_DEFAULTS` (12 purposes) + `resolveSystemPrompt()` (`src/prompts/registry.ts`), 10 consumers wired (assistant/gm/vn/vnChoices/transition/intent/memory), commit `9aefe593`; design `.plan/design/prompt-template-registry.md`; registry hardening tracked by `TASK-prompt-template-registry.md` |
| Phase 4 — Image-Edit Integration | workflow registration | ✅ Loader + config surface shipped (`src/image-edit/template-registry.ts`) |
| LLM cleanup | typed purposes, single defaults source, dead accessors, llm.yaml validation | 🟡 `TASK-prompt-template-registry.md` (design complete) |

Design doc: `.plan/design/prompt-template-registry.md` — typed `PromptPurpose` union, `TEMPLATES_DEFAULTS.llm.systemPrompts` → `{}` (registry sole defaults source), dead accessor removal (`src/config/sections/llm-templates.ts`), llm.yaml load validation.

---

## Summary

Config-driven template system: replace, extend, or partially override in-app sane defaults
for generation templates via YAML files in config/templates/.

Four domains:

1. **LLM** - system prompts, chat format, summarization
2. **SD** - image model profiles, prompt templates, model matching
3. **Avatar** - emotion-to-asset mapping, intent patterns, emotion detection prompts
4. **Image-Edit** - ComfyUI workflow templates

Each domain supports three merge strategies:

- **replace** - wipe built-ins, use only config values
- **extend** - add new entries to built-ins (default)
- **override** - deep merge over built-ins (field-level)

---

## File Structure

    config/templates/
      llm.yaml          # LLM generation templates
      sd.yaml           # SD image generation profiles
      avatar.yaml       # Emotion avatars + intent patterns
      image-edit.yaml   # ComfyUI workflow templates

---

## Merge Semantics

Each file declares a merge key:

    merge: extend  # replace | extend | override

- replace: Entire domain replaced by config value
- extend: New entries added; config wins on key conflict
- override: Deep merge - config fields overlay built-in fields

---

## Loader Architecture

    config/templates/*.yaml
            |
      TemplateConfigLoader
        - finds files (same search path as main config)
        - parses YAML
        - applies merge strategy per domain
        - returns TemplatesConfig
            |
      Integrated into Config (src/config/schema.ts)

Reuses existing infrastructure:

- findConfigFile() from load.ts for file discovery
- parseFileContent() for YAML parsing
- deepMerge() for override strategy
- New: extend/replace logic per domain

---

## Domain Schemas

### LLM (config/templates/llm.yaml)

    merge: extend
    systemPrompts:
      chat: "You are {{charName}}. {{charDescription}}"
      summarize: "Summarize this conversation concisely."
      imagePrompt: "Write image generation tags for: {{scene}}"
      ooc: "You are the game master. Narrate the scene."
    chatFormats:
      alpaca:
        system: "### System:\n{system}\n### Instruction:\n{prompt}\n### Response:\n"
        user: "{message}"
        assistant: "{message}"

### SD (config/templates/sd.yaml)

    merge: extend
    profiles:
      myCustom:
        id: myCustom
        name: My Custom Model
        families: [custom]
        promptFormat: natural
        maxTokenHint: 300
        defaults:
          cfgScale: 7
          steps: 25
          sampler: euler
        templates:  # per detail level, per gen mode
          instant:
            yourself: "Briefly: describe {{charName}}. {{charDescription}}"
    modelMatching:
      - pattern: my-model
        profileId: myCustom

### Avatar (config/templates/avatar.yaml)

    merge: extend
    emotions:
      happy:
        asset: happy.png
        intent: "The character smiles warmly"
      sad:
        asset: sad.png
        intent: "The character looks downcast"
    intentPatterns:
      - pattern: smile
        emotion: happy
      - pattern: grin
        emotion: happy
      - pattern: cry
        emotion: sad

### Image-Edit (config/templates/image-edit.yaml)

    merge: extend
    workflows:
      upscale-4x:
        id: upscale-4x
        name: 4x Upscale
        category: upscale
        backend: comfyui
        description: "Upscale image 4x with ESRGAN"

---

## Implementation Phases

### Phase 1 - Template Config Loader

| Task                                        | Files                                 | Effort |
| ------------------------------------------- | ------------------------------------- | ------ |
| Define TemplatesConfig types                | src/config/sections/templates.ts      | Med    |
| Template config loader (find, parse, merge) | src/config/templates-loader.ts        | Med    |
| Wire into main Config schema                | src/config/schema.ts, schema-class.ts | Low    |
| Unit tests for merge strategies             | src/config/templates-loader.test.ts   | Med    |

### Phase 2 - SD Templates Integration

| Task                                    | Files                              | Effort |
| --------------------------------------- | ---------------------------------- | ------ |
| Config-driven profile registry          | src/generation/prompt-templates.ts | Med    |
| Config default YAML                     | config/templates/sd.yaml           | Low    |
| Migration: builtin profiles to defaults | src/generation/prompt-templates.ts | Low    |

### Phase 3 - Avatar Templates Integration

| Task                                  | Files                                           | Effort |
| ------------------------------------- | ----------------------------------------------- | ------ |
| Emotion config schema                 | src/config/sections/templates.ts                | Low    |
| Wire emotion-avatar section to config | src/assistant/prompt/sections/emotion-avatar.ts | Med    |
| Intent pattern matching               | src/assistant/intent.ts                         | Med    |
| Config default YAML                   | config/templates/avatar.yaml                    | Low    |

### Phase 4 - LLM + Image-Edit Integration

| Task                             | Files                               | Effort |
| -------------------------------- | ----------------------------------- | ------ |
| LLM system prompt config         | src/generation/prompt-templates.ts  | Med    |
| Config default YAML              | config/templates/llm.yaml           | Low    |
| Image-edit template registration | src/image-edit/template-registry.ts | Med    |
| Config default YAML              | config/templates/image-edit.yaml    | Low    |

---

## Testing Strategy

| Test        | Coverage                              | Files                                                |
| ----------- | ------------------------------------- | ---------------------------------------------------- |
| Unit        | Merge strategy correctness            | src/config/templates-loader.test.ts                  |
| Unit        | Extend adds new, override deep-merges | src/config/templates-loader.test.ts                  |
| Unit        | Replace wipes defaults                | src/config/templates-loader.test.ts                  |
| Unit        | SD profile resolution from config     | src/generation/prompt-templates.test.ts              |
| Unit        | Avatar emotion resolution from config | src/assistant/prompt/sections/emotion-avatar.test.ts |
| Integration | Config change to template refresh     | tests/integration/                                   |

---

## References

- src/config/load.ts - existing config loader with deepMerge
- src/generation/prompt-templates.ts - SD prompt templates (BUILTIN_PROFILES)
- src/image-edit/template-registry.ts - ComfyUI template registry
- src/assistant/prompt/sections/emotion-avatar.ts - emotion avatar section
- src/assistant/intent.ts - avatar change intent detection

## Related Epics

- Epic Config Extensions (epic-config-extensions.md) - extensible enum mechanism
- Epic ComfyUI Plugin - image-edit integration
- Epic Character Core System - mood/emotion/avatar
