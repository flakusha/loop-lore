<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN Scene Template System

**Summary:** The custom-template engine behind VN templates — variable
substitution, inheritance, per-world persistence, JSON import/export, and
composite steps. The engine is complete and tested, and its render-time subset
is now consumed by `render-scene.ts` via `templates/apply.ts`; the composite
executor and the GM UI do not exist, and nothing outside the renderer and the
engine's own tests touches it.
**Context:** Extends `TASK-vn-template-actions.md` (built-in templates) with
user-authored templates that reference character stats, locations, inventory,
and story state. See `## Design` (types, `{{var}}` syntax, inheritance,
composition) and `## Implementation` (the 5-phase plan).
**Acceptance Criteria:** Split in `## Acceptance Criteria` — engine boxes
(verified in `src/frontend/vn/templates/template-engine.ts`) vs boxes that are
not implemented.


**Priority:** Medium
**Status:** Done
**Status Note:** (2026-08-23) "Engine Complete — GM builder UI not implemented". Reconciled 2026-10-09: engine verified present and tested, composite execution never existed (only the step interface), and there is no GM builder UI. Done → In Progress. Updated the same day after `vn-mode-qa-loop` was found: Phase 5 is now partly closed — `render-scene.ts:202` calls `applyTemplateOverrides` — so the remaining gaps are composites, conditions/delays, dialogue-template consumption, and the builder UI. The closed git issue is left as-is; re-opening it is out of scope here.
**Epic:** epic-visual-novel-mode
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

- [x] Wire template engine to `scene-renderer.ts` — partially: `render-scene.ts:202`
      calls `applyTemplateOverrides` (`templates/apply.ts`), merging the
      layout / transition / typewriter-speed subset (2026-10-09)
- [ ] Wire template engine to `typewriter.ts`
- [ ] Wire template engine to `transition-engine.ts`
- [ ] Template quick-apply in chat toolbar
- [ ] Template auto-suggest based on scene context

## Files to Create

- `src/frontend/vn/templates/template-engine.ts` — ✅ exists
- `src/frontend/vn/templates/variable-resolver.ts` — not created; the resolver
  is `resolveVariables` inside `template-engine.ts`
- `src/frontend/vn/templates/template-builder.ts` — not created
- `src/frontend/vn/templates/template-gallery.ts` — not created
- `src/frontend/vn/templates/template-storage.ts` — not created; storage is
  inlined in `template-engine.ts` (`localStorage`, key `vn-templates-<worldId>`)

## Files to Modify

- `src/frontend/vn/scene-renderer/render-scene.ts` — consume template engine (done via `templates/apply.ts`; the path in the original list, `src/frontend/vn/scene-renderer.ts`, does not exist)
- `src/frontend/vn/typewriter.ts` — consume dialogue template variables
- `src/frontend/vn/transition-engine.ts` — consume composite templates
- `src/components/chat/chat-settings-modal.html` — add template builder UI
- `src/frontend/vn/templates/index.ts` — export template engine

## Acceptance Criteria

### ✅ Engine

Verified 2026-10-09 in `src/frontend/vn/templates/template-engine.ts`
(covered by `template-engine.test.ts`):

- [x] `VnTemplate` / `VnTemplateVariable` / `VnTemplateBody` types exist —
      `template-engine.ts:16,32,42`
- [x] Variable substitution works in text fields (`{{name}}` → resolved value) —
      `substituteTemplate` `:107`; unresolved names are left as-is `:113`
- [x] Required variables enforce presence before template application —
      `resolveVariables` throws on missing required `:90`
- [x] Templates persist per-world in localStorage — `getTemplatesForWorld`
      `:171`, `saveTemplate` `:183` (bumps `version`), `deleteTemplate` `:208`
- [x] Templates can be exported/imported as JSON — `exportTemplate` `:235`,
      `importTemplate` `:244` (rejects a payload with no `id`/`name`/`worldId`)
- [x] Template inheritance works (child inherits parent, overrides fields) —
      `resolveTemplate` `:133` merges parent `body` then child, child variables win
- [x] Built-in template free-text search — `searchTemplates` matches name,
      description, and tags across scene + dialogue templates
      (`scene-templates/search.ts:12`); no category filter

### 🟡 Partially wired / not implemented

- [ ] Composite template execution — **the 2026-08-23 AC claiming a
      "composite executor" was false**: only the `VnCompositeStep` *interface*
      exists (`template-engine.ts:66`); nothing in `src/` steps through a
      composite, evaluates a step `condition`, or honours a step `delay`
- [x] Scene-renderer reads the template registry (Phase 5, partial) —
      `render-scene.ts:202` calls `applyTemplateOverrides(baseSettings, scene)`
      from `src/frontend/vn/templates/apply.ts`, which resolves the scene's
      `templateId` and merges the whitelisted `layout` / `imageScaling` /
      `transition` / `typewriterSpeed` subset of `body`. Landed on
      `vn-mode-qa-loop` at `e87bd19c0`. Narrower than "the renderer consumes the
      engine": composites, conditions, and delays are still absent, and
      `apply.ts` deliberately fails closed to base settings rather than
      propagating an unresolved variable.
- [ ] `typewriter.ts` wiring — reads `settings.typewriterSpeed` only; it never
      reads a dialogue template
- [ ] `transition-engine.ts` wiring — `evaluateTriggers` still has no caller
- [ ] GM builder UI — `template-builder.ts` and `template-gallery.ts` were
      never created (see `## Files to Create`)
- [ ] Template builder UI allows drag-and-drop scene element configuration
- [ ] Template gallery shows all templates by category
- [ ] Variable autocomplete shows available variables in GM UI
- [ ] Variable type validation — `resolveVariables` accepts any type; the
      `enum` / `asset` types on `VnTemplateVariable` are declared but never
      checked (`apply.ts` compensates by discarding out-of-union values at the
      call site rather than by validating)
- [ ] Context sources 1-5 in `## Design` (character → location → chat → GM →
      default) — `resolveVariables` takes a flat `Record<string, unknown>`; the
      per-source lookup chain is not implemented
- [ ] Conditional steps (`condition` expression evaluation)
- [ ] Step delay for timing control

### 🟢 Performance

- [x] No performance regression in VN mode rendering — one registry lookup per
      scene, and `apply.ts` is built to fail closed to the base settings object
      rather than throw mid-render (2026-10-09)

## Risk

Med — template engine is a significant feature but stays within frontend (no DB schema). Main risk is variable resolver complexity when resolving across character/location/chat state. Composite template timing needs careful UX to avoid confusion.

## Related

- `TASK-vn-template-actions.md` — pre-defined templates (this ticket adds custom engine)
- `TASK-visual-novel-mode.md` — base VN renderer
- `TASK-vn-dynamic-generation.md` — dynamic generation can output templates
- `TASK-vn-branching-choices.md` — choices can trigger template changes

**Resolved:** 2026-10-09 registry-driven close: git issue 83a03a9 (registry tip: 3d7069c37 Konstantin Fedotov Ticket status: done)
