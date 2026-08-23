<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-template-unified-variable-engine

**Status**: open
**Priority**: high
**Labels**: templates, prompt-assembly, architecture, config
**Assignee**:
**Epic**: epic-config-templates
**Related**: `docs/spec/template-system.md`, `src/prompts/registry.ts`, `src/generation/prompt-templates/templates.ts`

## Description

LLM system prompts configured via `configs/templates/llm.yaml` cannot use
`{{variable}}` template substitution. The image generation system has
`resolveTemplate()` in `src/generation/prompt-templates/templates.ts` with 9
tokens + `ctx.extra` extensibility, but the LLM prompt system returns raw
strings from `resolveSystemPrompt()` with zero substitution.

**Evidence of the gap**:

```typescript
// src/prompts/registry.ts — NEVER resolved
chat: "You are {{charName}}. {{charDescription}}"
```

The actual character identity is injected programmatically by
`actorHeaderSection` via string concatenation — not template resolution.

### What should work (but doesn't)

```yaml
# configs/templates/llm.yaml
systemPrompts:
  chat: |
    You are {{charName}}.
    Personality: {{charPersonality}}
    Scenario: {{charScenario}}
    Permanent traits: {{character.permanentTraits}}
    Current mood: {{character.mood}} (happiness: {{character.happiness}})
    Relationships: {{character.relationships}}
```

### Architecture

The spec at `docs/spec/template-system.md` already defines the unified design:
- `prompt_templates` DB table (modality-agnostic)
- `template_variables` DB table (per-template variable definitions)
- Cross-modality `resolveTemplate(body, ctx)` shared function
- Cross-modality variable table (LLM, Image, Video, Audio columns)

The image generation system partially implements this. The LLM system has
**none** of it.

### Acceptance Criteria

- [ ] `resolveSystemPrompt()` accepts a `TemplateContext` and resolves `{{token}}` placeholders
- [ ] LLM prompt defaults (`LLM_PROMPT_DEFAULTS`) are resolvable — no vestigial tokens
- [ ] User-configured `systemPrompts` in `configs/templates/llm.yaml` support `{{token}}` substitution
- [ ] Template variable resolution is shared between image prompt and LLM prompt systems
- [ ] `ctx.extra` extensibility works for LLM prompts (same as image prompts)
- [ ] Config example files (`configs/templates/llm.example.yaml`, `llm.example.toml`) document available variables
- [ ] Existing prompt assembly tests pass unchanged (backward compatible)
- [ ] Token budget accounting includes resolved variable expansion

### Notes

- Start with extracting `resolveTemplate()` from `src/generation/prompt-templates/templates.ts` into a shared utility
- The `DOUBLE_BRACE` pattern in `src/regex/placeholders.ts` already exists
- Consider: should the PromptAssembler resolve template variables in `systemPromptOverride` / `systemPromptFallback`?
- The `chatFormats` section of LLM config also needs template support for Jinja-style formatting
