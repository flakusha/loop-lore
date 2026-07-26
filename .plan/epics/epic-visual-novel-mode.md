# EPIC: Visual Novel Mode — Dynamic Generation & Q&A Mode

**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** visual-novel, dynamic-image, story-generation, qa-mode, chat-mode

## Summary

Extend Visual Novel Mode with dynamic image and story generation capabilities, plus a question<->answer chat mode that supports VN-style interactive storytelling. Builds on the existing Visual Novel Mode backend (completed) and branching choices task.

## How It Extends Existing Work

- `TASK-visual-novel-mode.md` — base VN rendering (backend complete)
- `TASK-vn-branching-choices.md` — branching choices with relationship impact
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation (this epic)
- `TASK-vn-qa-mode.md` — question<->answer VN mode (this epic)

## Core Features

### Dynamic Image Generation

- Location-scene auto-generation (generate images for each location/scene)
- Character portrait generation from character data
- Mood-based image variation (character expressions change with mood)
- Event-triggered image generation (combat, weather, special moments)
- Image caching and pre-generation for common scenes

### Dynamic Story Generation

- Scene description auto-generation for unexplored locations
- Narrative bridge generation between chat turns
- Atmosphere/ambient story text generation
- Lore-consistent story continuation
- Genre/style-aware story generation

### Q&A Mode (Question <-> Answer)

- Structured Q&A interaction pattern within VN scenes
- Player questions trigger character responses with emotion/expression changes
- Answer-driven scene branching (different answers lead to different scenes)
- Question types: lore, relationship, combat, exploration, social
- Answer scoring and consequence tracking
- Q&A session persistence across chat turns

### Combined Mode

- VN scenes with both dynamic generation AND Q&A interaction
- Scene transitions triggered by Q&A outcomes
- Dynamic images update based on Q&A choices
- Story generation adapts to Q&A context

## Design

### Dynamic Generation Pipeline

```
Scene Trigger → Context Analysis → Image Generation → Story Generation → VN Rendering
```

### Q&A Mode Structure

```typescript
interface VNQuestion {
  id: string;
  scene_id: string;
  question_type: "lore" | "relationship" | "combat" | "exploration" | "social";
  question_text: string;
  options: VNQuestionOption[];
  next_scene_id: string;
  consequences: VNConsequence[];
}

interface VNQuestionOption {
  id: string;
  text: string;
  emotion_modifier: number;
  relationship_modifier: number;
  next_scene_id: string;
}

interface VNConsequence {
  type: "scene_change" | "mood_shift" | "relationship_change" | "item_gain" | "location_change";
  target: string;
  value: number;
}
```

## Tasks

- `TASK-vn-dynamic-generation.md` — dynamic image and story generation
- `TASK-vn-qa-mode.md` — question<->answer VN mode

## Related

- Epic Immersion & Presentation (EPIC-048)
- Epic Character Core System (EPIC-047)
- Epic Chat Lifecycle & Moderation (EPIC-036)
- `TASK-visual-novel-mode.md` — base VN rendering
- `TASK-vn-branching-choices.md` — branching choices with relationship impact
- `TASK-vn-dynamic-generation.md` — dynamic image/story generation
- `TASK-vn-qa-mode.md` — Q&A mode for VN

## Linked Tasks

- TASK-visual-novel-mode.md
- TASK-vn-branching-choices.md
- TASK-vn-dynamic-generation.md
- TASK-vn-qa-mode.md
