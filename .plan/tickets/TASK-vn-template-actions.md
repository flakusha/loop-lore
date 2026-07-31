# TASK: VN Pre-Configured Scene & Dialogue Templates

**Priority:** Medium
**Status:** ✅ Complete
**Epic:** Epic Visual Novel Mode (51)
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

- [ ] Scene templates apply layout, transition, emotion defaults to VN scenes
- [ ] Dialogue templates control typewriter speed, pauses, text style
- [ ] Transition triggers auto-fire on location change, combat start, etc.
- [ ] GM can browse and select templates from a picker UI
- [ ] Templates can be overridden per-scene without modifying the template
- [ ] Template chaining works (apply intro → dialogue → resolution sequence)
- [ ] Templates don't conflict with manual VN settings
- [ ] No performance regression in VN mode rendering

## Risk

Low — templates are pure configuration overlays on existing VN renderer. No schema changes. Main risk is template override precedence vs manual settings.

## Related

- `TASK-visual-novel-mode.md` — base VN renderer
- `TASK-vn-branching-choices.md` — choices integrate with dialogue templates
- `TASK-vn-dynamic-generation.md` — dynamic generation can produce templates
- `TASK-vn-scene-template-system.md` — template engine for custom templates
