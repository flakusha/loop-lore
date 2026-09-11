<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Prompt Library — Reusable Prompt Templates

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low–Med
**Epic:** epic-assistant-generation-extensions
**Source:** Roadmap migration, 2026-07-19

> **Backend foundation shipped (2026-08-03):** config-file builtins registry
> (`src/prompts/registry.ts`, 12 purposes, `resolveSystemPrompt`, `configs/templates/llm.yaml`)
> is the foundation this library builds on — `prompt_templates` DB table = `userTemplates`,
> registry `builtins` + `resolve` already exist. See `FEAT-065-template-system.md` +
> `.plan/epics/epic-config-templates.md` (registry hardening: `TASK-prompt-template-registry.md`).

## Summary

User-facing prompt library — save, share, and reuse prompt templates. Users can create system prompts, character descriptions, and scenario templates.

## Rationale

- Users recreate similar prompts across characters
- Community wants to share effective prompts
- Reduces friction for new users

## Design

### Prompt Template

```typescript
interface PromptTemplate {
  id: string;
  userId: string;
  name: string; // "Fantasy GM", "Detective Noir"
  category: PromptCategory; // system | character | scenario | custom
  content: string; // Template text with {{variables}}
  variables: TemplateVariable[]; // {{char}}, {{user}}, etc.
  visibility: "private" | "shared" | "public";
  tags: string[];
  usageCount: number;
  rating: number; // Community rating
}
```

### Macro engine (ST macro parity)

`{{user}}`, `{{char}}`, `{{time}}`, `{{date}}` base; args via space or `::` (`{{getvar::name}}`, `{{random::a::b}}`), nesting inner-first (`{{getvar::{{char}}_mood}}`), scoped blocks `{{#setvar x}}...{{/setvar}}` with trim/dedent, `{{if}}...{{else}}...{{/if}}`, `{{// comment}}`, backslash escape. Editor autocompletes on `{{` + Ctrl+Space (M).

### Per-template Valves/UserValves (OWUI pattern)

Nested `Valves` (admin-only: model params, API keys) + `UserValves` (per-user from the chat session: toggles, thresholds) as typed fields on each template; types drive the UI (bool switch, select, masked password, multiselect). Event-style templates carry Valves but never UserValves. Stored as JSON; encrypt at rest (M).

### UI

- Prompt library panel (browse, search, filter)
- Template editor with variable highlighting
- "Save as template" action from existing prompts
- Share prompt (public link or community feed)

## Tasks

- [ ] Create `prompt_templates` table
- [ ] Add template CRUD endpoints
- [ ] Add template editor UI
- [ ] Add template browser/search
- [ ] Add "save as template" action
- [ ] Add share/export functionality
- [ ] Template-as-model (Pipe manifold) + Quick-Reply execution: a template may register `pipes()->[{id,name}]` so one template appears as N selectable models; plus one-click 'run as Quick Reply' (slash batch + `{{pipe}}` + local/global vars + `/buttons` confirm) with `usageCount` incremented once per turn (M).

## Files to Create

- `src/db/schema-prompt-templates.ts` — template tables
- `src/routes/prompt-templates.ts` — CRUD endpoints
- `src/components/prompt-library.html` — library UI
- `src/components/template-editor.html` — editor UI

## Risk

Low — standalone feature, minimal integration points.

## Linked Epics

- `epic-assistant-generation-extensions.md`
