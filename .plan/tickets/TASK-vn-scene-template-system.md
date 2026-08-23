<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN Scene Template System

**Priority:** Medium
**Status:** ✅ Engine Complete (2026-08-23) — Template core done; GM builder UI not implemented
**Epic:** Epic Visual Novel Mode (51)
**Tags:** vn, templates, system, engine, custom, gm-tools
**Effort:** Med

## Summary

Template engine for VN mode — create, store, compose, and apply custom scene templates. Extends TASK-vn-template-actions.md (pre-defined templates) with a full template system: variable substitution, template inheritance, composition, and a GM-facing template builder. Templates are stored per-world and shareable across chats.

## How It Extends Existing Work

TASK-vn-template-actions.md provides pre-defined templates. This ticket adds the engine that makes templates dynamic: variables, inheritance, composition, and persistence. GMs build custom templates that reference character stats, locations, inventory, and story state.

## Design

### Template Engine

```typescript
interface VnTemplate {
  id: string;
  name: string;
  description: string;
  worldId: string; // scope to world
  category: "scene" | "dialogue" | "transition" | "composite";
  version: number;
  variables: VnTemplateVariable[];
  body: VnTemplateBody;
  tags: string[];
  created: Date;
  modified: Date;
}

interface VnTemplateVariable {
  name: string; // e.g. "character_name", "mood"
  type: "string" | "number" | "boolean" | "enum" | "asset";
  default?: unknown;
  required: boolean;
  description?: string;
  enum?: string[]; // for enum type
}

interface VnTemplateBody {
  layout: "overlay" | "below" | "split" | "inherit";
  layoutConfig?: Record<string, unknown>;
  transition: TransitionType | "inherit";
  dialogueStyle: string; // references dialogue template ID
  portrait?: {
    position: "left" | "right" | "center" | "inherit";
    size?: number;
    expression?: string;
  };
  background?: {
    scaling: "contain" | "cover" | "fill";
    filter?: string; // CSS filter
    parallax?: boolean;
  };
  text?: {
    typewriterSpeed: number;
    pauseOnPunctuation: boolean;
    fontStyle: string;
  };
}
```

### Variable Substitution

Templates support `{{variable}}` syntax in text fields:

```
"{{character_name}} approaches the {{location_name}} with a {{mood}} expression."
```

Variables resolve at render time from:

1. Character data (name, stats, mood)
2. Location data (name, description)
3. Chat state (current scene, turn, time)
4. User-defined variables (GM input)
5. Template defaults

### Template Inheritance

```typescript
interface VnTemplateInheritance {
  parentTemplateId?: string; // inherit from parent
  overrides: string[]; // fields that override parent
}
```

Example: `confrontation_tense` inherits from `confrontation`, overrides `typewriterSpeed: "fast"` and `transition: "cut"`.

### Template Composition

Composite templates combine multiple sub-templates:

```typescript
interface VnCompositeTemplate {
  id: string;
  name: string;
  steps: VnCompositeStep[];
}

interface VnCompositeStep {
  templateId: string;
  variables?: Record<string, unknown>;
  condition?: string; // JS expression for conditional apply
  delay?: number; // ms before applying next step
}
```

Example: `combat_intro` composite:

1. Apply `flashback` template (memory of last battle)
2. Wait 2000ms
3. Apply `combat_start` template
4. Apply `dialogue_tense` dialogue template

## Implementation

### Phase 1: Template Storage

- [ ] Create `src/frontend/vn/templates/template-engine.ts` — core engine
- [ ] Template storage: `localStorage` per-world (no DB schema needed)
- [ ] Template CRUD: create, read, update, delete
- [ ] Template import/export as JSON
- [ ] Template versioning (increment on save)

### Phase 2: Variable System

- [ ] Variable parser: `{{variable}}` syntax
- [ ] Variable resolver: character → location → chat → GM → default
- [ ] Variable type validation (string, number, boolean, enum, asset)
- [ ] Required variable enforcement (error if missing)
- [ ] Variable autocomplete in GM UI

### Phase 3: Inheritance & Composition

- [ ] Parent template lookup and field merge
- [ ] Override detection (child fields override parent)
- [ ] Composite template executor (sequential step application)
- [ ] Conditional steps (`condition` expression evaluation)
- [ ] Step delay for timing control

### Phase 4: GM Template Builder

- [ ] Template builder UI — drag-and-drop scene elements
- [ ] Variable editor — add/remove/configure template variables
- [ ] Template preview — render template with sample data
- [ ] Template gallery — browse/search by category, tag
- [ ] Template duplication (fork existing template)
- [ ] Template sharing (export JSON, import into other worlds)

### Phase 5: Integration

- [ ] Wire template engine to `scene-renderer.ts`
- [ ] Wire template engine to `typewriter.ts`
- [ ] Wire template engine to `transition-engine.ts`
- [ ] Template quick-apply in chat toolbar
- [ ] Template auto-suggest based on scene context

## Files to Create

- `src/frontend/vn/templates/template-engine.ts`
- `src/frontend/vn/templates/variable-resolver.ts`
- `src/frontend/vn/templates/template-builder.ts`
- `src/frontend/vn/templates/template-gallery.ts`
- `src/frontend/vn/templates/template-storage.ts`

## Files to Modify

- `src/frontend/vn/scene-renderer.ts` — consume template engine
- `src/frontend/vn/typewriter.ts` — consume dialogue template variables
- `src/frontend/vn/transition-engine.ts` — consume composite templates
- `src/components/chat/chat-settings-modal.html` — add template builder UI
- `src/frontend/vn/templates/index.ts` — export template engine

## Acceptance Criteria

### ✅ Engine (DONE)

- [x] GM can create custom scene templates with variables — `VnTemplate` / `VnTemplateVariable` types in `src/frontend/vn/templates/template-engine.ts`
- [x] Variable substitution works in text fields (`{{name}}` → resolved value) — `resolveVariables`, `substituteTemplate`
- [x] Template inheritance works (child inherits parent, overrides fields) — `resolveTemplate`
- [x] Composite templates execute sequential steps with delays — composite executor in `template-engine.ts`
- [x] Templates persist per-world in localStorage — localStorage CRUD
- [x] Templates can be exported/imported as JSON — `exportTemplate` / `importTemplate`
- [x] Required variables enforce presence before template application — `resolveVariables` raises on missing required

### ⬜ GM Builder UI (NOT IMPLEMENTED)

- [ ] Template builder UI allows drag-and-drop scene element configuration
- [ ] Template gallery shows all templates by category
- [ ] Variable autocomplete shows available variables in GM UI

### 🟢 Performance

- [x] No performance regression in VN mode rendering

## Risk

Med — template engine is a significant feature but stays within frontend (no DB schema). Main risk is variable resolver complexity when resolving across character/location/chat state. Composite template timing needs careful UX to avoid confusion.

## Related

- `TASK-vn-template-actions.md` — pre-defined templates (this ticket adds custom engine)
- `TASK-visual-novel-mode.md` — base VN renderer
- `TASK-vn-dynamic-generation.md` — dynamic generation can output templates
- `TASK-vn-branching-choices.md` — choices can trigger template changes
