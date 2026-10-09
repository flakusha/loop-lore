<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN Pre-Configured Scene & Dialogue Templates

**Summary:** Pre-configured scene and dialogue templates for VN mode — a GM
picks "Confrontation" and the engine pre-fills layout, transition, pacing, and
portrait position. The template data exists; nothing renders from it.
**Context:** Lets a GM compose VN scenes without hand-configuring every element.
See `## Summary`, `## Pre-Configured Templates` (the catalog), `## Design`
(the two template interfaces), and `## Implementation` (phased plan).
**Acceptance Criteria:** Split in `## Acceptance Criteria` — data boxes
(verified in `src/frontend/vn/templates/`) vs wiring boxes (no consumer).


**Priority:** Medium
**Status:** Done
**Status Note:** (2026-08-23) marked Done. Reconciled 2026-10-09: the template arrays and trigger list are real, but no renderer module imported them — `scene-renderer/`, `typewriter.ts`, `transition-engine.ts`, and `chat.html` all had zero references. Done → In Progress. Updated the same day after `vn-mode-qa-loop` was found: `render-scene.ts:202` now calls `applyTemplateOverrides`, so the scene side is wired; dialogue templates, `evaluateTriggers`, and the picker UI remain open. The closed git issue is left as-is; re-opening it is out of scope here.
**Epic:** epic-visual-novel-mode
**Tags:** vn, templates, scenes, dialogue, pre-configured, ux
**Effort:** Med

## Summary

Pre-configured, reusable scene and dialogue templates for VN mode. GMs select a template → it populates scene layout, dialogue structure, transitions, and character positioning. Templates act as building blocks — a GM picks "Confrontation Scene" and the VN engine pre-fills portrait layout, dialogue pacing, emotion triggers, and transition style.

## How It Extends Existing Work

Builds on TASK-visual-novel-mode.md (scene renderer, typewriter, transitions) and TASK-vn-branching-choices.md (choice mechanics). Templates are the layer that lets GMs quickly compose VN scenes without manually configuring every scene element.

## Pre-Configured Templates

### Scene Templates

| Template        | Description                   | Layout  | Transition | Emotion       |
| --------------- | ----------------------------- | ------- | ---------- | ------------- |
| `introduction`  | New character/location reveal | split   | fade-in    | neutral       |
| `confrontation` | Tense dialogue exchange       | overlay | cut        | angry/tense   |
| `resolution`    | Conflict resolution, relief   | below   | dissolve   | calm/relieved |
| `flashback`     | Memory/dream sequence         | overlay | slide      | melancholy    |
| `discovery`     | Finding something important   | below   | fade       | surprised     |
| `farewell`      | Leaving a character/location  | split   | wipe       | sad           |
| `combat_start`  | Battle transition             | overlay | cut        | alert         |
| `quiet_moment`  | Peaceful scene, bonding       | below   | dissolve   | calm/happy    |
| `mystery`       | Suspense, investigation       | split   | fade       | curious/tense |
| `celebration`   | Victory, festival             | below   | slide      | happy/excited |

### Dialogue Templates

| Template           | Description                  | Pacing | Pauses                | Typewriter Speed |
| ------------------ | ---------------------------- | ------ | --------------------- | ---------------- |
| `narration`        | Story narration, no portrait | Slow   | Heavy (200ms periods) | Slow             |
| `dialogue_normal`  | Standard character speech    | Normal | Light (100ms commas)  | Normal           |
| `dialogue_tense`   | Tense exchange, short lines  | Fast   | Minimal               | Fast             |
| `dialogue_whisper` | Quiet, intimate moment       | Slow   | Heavy                 | Slow             |
| `dialogue_shout`   | Urgent, loud delivery        | Fast   | None                  | Fast             |
| `inner_thought`    | Character inner monologue    | Slow   | Heavy                 | Slow             |
| `system_text`      | System prompts, game info    | Normal | Light                 | Normal           |

### Transition Triggers

| Trigger              | Condition                                  | Template                          |
| -------------------- | ------------------------------------------ | --------------------------------- |
| `on_location_change` | `currentLocationId !== previousLocationId` | `introduction` or `discovery`     |
| `on_combat_start`    | Battle mode activated                      | `combat_start`                    |
| `on_character_enter` | New character in scene                     | `introduction`                    |
| `on_emotion_shift`   | Detected emotion change > threshold        | `confrontation` or `quiet_moment` |
| `on_choice_result`   | Branching choice resolved                  | `resolution` or `discovery`       |
| `on_scene_end`       | GM/scripted scene end                      | `farewell`                        |

## Design

```typescript
interface VnSceneTemplate {
  id: string;
  name: string;
  description: string;
  layout: "overlay" | "below" | "split";
  transition: TransitionType;
  defaultEmotion?: string;
  typewriterSpeed: "slow" | "normal" | "fast";
  pauseIntensity: "none" | "light" | "heavy";
  portraitPosition?: "left" | "right" | "center";
  backgroundScaling: "contain" | "cover" | "fill";
  dialogueBoxStyle: "standard" | "whisper" | "shout" | "narration" | "thought";
}

interface VnDialogueTemplate {
  id: string;
  name: string;
  pacing: "slow" | "normal" | "fast";
  pauseOnComma: boolean;
  pauseOnPeriod: boolean;
  typewriterDelay: number; // ms per character
  lineBreakPause: number; // ms
  portraitFading: boolean;
  textShadow: boolean;
  fontStyle: "normal" | "italic" | "bold";
}
```

## Implementation

### Phase 1: Template Data

- [ ] Create `src/frontend/vn/templates/scene-templates.ts` — pre-defined scene templates
- [ ] Create `src/frontend/vn/templates/dialogue-templates.ts` — pre-defined dialogue templates
- [ ] Create `src/frontend/vn/templates/transition-triggers.ts` — auto-trigger rules
- [ ] Template registry — lookup by ID, list all, filter by tag

### Phase 2: Template Application

- [ ] Apply scene template to current VN scene (merge template → scene config)
- [ ] Apply dialogue template to dialogue box renderer
- [ ] Template override — user/GM can override individual template fields
- [ ] Template chaining — apply multiple templates sequentially

### Phase 3: GM UI

- [ ] Template picker modal — browse/search templates by category
- [ ] Template preview — show layout preview before applying
- [ ] Quick-apply button in chat toolbar
- [ ] Template favorites/recent list
- [ ] Custom template creation (extends base templates)

## Files to Create

- `src/frontend/vn/templates/scene-templates.ts`
- `src/frontend/vn/templates/dialogue-templates.ts`
- `src/frontend/vn/templates/transition-triggers.ts`
- `src/frontend/vn/templates/index.ts`

## Files to Modify

- `src/frontend/vn/scene-renderer.ts` — consume templates for scene config
- `src/frontend/vn/typewriter.ts` — consume dialogue templates for pacing
- `src/frontend/vn/transition-engine.ts` — consume transition triggers
- `src/components/chat/chat-settings-modal.html` — add template picker UI

## Acceptance Criteria

### ✅ Pre-defined Data (DONE)

- [x] Scene templates defined as `SCENE_TEMPLATES` array (`src/frontend/vn/templates/scene-templates/scene-templates.ts:16-240`) — 10 scenes (introduction, confrontation, resolution, flashback, discovery, farewell, combat_start, quiet_moment, mystery, celebration)
- [x] Dialogue templates defined as `DIALOGUE_TEMPLATES` array (`src/frontend/vn/templates/scene-templates/dialogue-templates.ts:8-140`) — 7 dialogue styles
- [x] Transition triggers defined as `TRANSITION_TRIGGERS` array (`src/frontend/vn/templates/transition-triggers.ts:40-90`) — 6 built-in triggers (location change, combat start, character enter, emotion shift, choice result, scene end)
- [x] Scene registry accessors — `getSceneTemplate`, `listSceneTemplates` (`scene-registry.ts:11,18`)
- [x] Dialogue registry accessors — `getDialogueTemplate`, `listDialogueTemplates` (`dialogue-templates.ts:152,159`)
- [x] Trigger evaluation + debug history — `evaluateTriggers`, `recordTrigger`, `getTriggerHistory`, `clearTriggerHistory` (`transition-triggers.ts:98,133,148,155`)
- [ ] `findMatchingTriggers` accessor — **does not exist**; the 2026-08-23 AC
      claimed it does. Nearest real equivalent is `evaluateTriggers`, which
      returns a single template rather than the matching list

### 🟡 Renderer/UI Wiring (partially wired 2026-10-09)

The first reconciliation pass (against `dev`) found no `templates/` import
anywhere under `src/frontend/` outside `src/frontend/vn/templates/` — the only
importers were the templates' own tests and `transition-triggers.ts`. Branch
`vn-mode-qa-loop` (`e87bd19c0`) added `templates/apply.ts` and calls it from
`render-scene.ts:202`, so the scene side is now wired. Dialogue templates and
trigger evaluation are still callerless.

- [x] Scene templates apply layout and transition defaults to VN scenes —
      `render-scene.ts:202` calls `applyTemplateOverrides(baseSettings, scene)`
      from `src/frontend/vn/templates/apply.ts`, which resolves the scene's
      `templateId` against the built-in registry and merges the
      `layout` / `imageScaling` / `transition` / `typewriterSpeed` subset.
      Landed on `vn-mode-qa-loop` at `e87bd19c0`. Narrower than the original
      "emotion defaults": `apply.ts` ignores every other template key.
- [ ] Dialogue templates control typewriter speed, pauses, text style —
      `typewriter.ts` still consumes only `settings.typewriterSpeed`; it never
      reads a dialogue template. The one speed field that is merged comes in as
      a layout setting, not a dialogue-style one.
- [ ] Transition triggers auto-fire on location change, combat start, etc. —
      `evaluateTriggers` still has no caller.
- [ ] GM can browse and select templates from a picker UI — no modal/sidebar
      UI; selection is implicit via a scene's `templateId`.
- [ ] Template override — user/GM can override individual template fields
- [ ] Template chaining — apply multiple templates sequentially
- [x] No performance regression in VN mode rendering — the merge is one
      registry lookup per scene and was designed to fail closed to base
      settings on a thrown `resolveVariables` or an out-of-union value (2026-10-09)

## Risk

Low — templates are pure configuration overlays on existing VN renderer. No schema changes. Main risk is template override precedence vs manual settings.

## Related

- `TASK-visual-novel-mode.md` — base VN renderer
- `TASK-vn-branching-choices.md` — choices integrate with dialogue templates
- `TASK-vn-dynamic-generation.md` — dynamic generation can produce templates
- `TASK-vn-scene-template-system.md` — template engine for custom templates

**Resolved:** 2026-10-09 registry-driven close: git issue 5cf3d0c (registry tip: 1cfc44a32 Konstantin Fedotov Ticket status: done)
