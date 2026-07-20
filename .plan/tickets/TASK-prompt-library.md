# TASK: Prompt Library — Reusable Prompt Templates

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Low–Med
**Source:** Roadmap migration, 2026-07-19

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
  name: string;                    // "Fantasy GM", "Detective Noir"
  category: PromptCategory;        // system | character | scenario | custom
  content: string;                 // Template text with {{variables}}
  variables: TemplateVariable[];   // {{char}}, {{user}}, etc.
  visibility: 'private' | 'shared' | 'public';
  tags: string[];
  usageCount: number;
  rating: number;                  // Community rating
}
```

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

## Files to Create

- `src/db/schema-prompt-templates.ts` — template tables
- `src/routes/prompt-templates.ts` — CRUD endpoints
- `src/components/prompt-library.html` — library UI
- `src/components/template-editor.html` — editor UI

## Risk

Low — standalone feature, minimal integration points.
