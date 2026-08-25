<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Assistant/GM Flows Reconciliation

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** assistant, gm, generation, content-creation, quality-gating

## Summary

Assistant/GM flows reconciliation — generation of new characters, items, worlds, locations, etc. with API call integrations AND confirmation/quality gating. Also encompasses GM-guided story creation where the user acts as Game Master, guiding LLM characters in chat/group-chat to create a story together.

## Current State (2026-08-14)

### Frontend: 🟡 Partial

- ✅ GM panel sidebar (shadow notes + whitenotes) — `src/components/chat/gm-panel.html` + `src/frontend/alpine/gm-panel.ts`
- ✅ Command buttons expanded (guide, scene, summarize, rewrite, translate)
- ✅ GmConfig extended (assistantRole, visualNovel); role dropdown in chat settings
- ✅ Slash command parser + dispatch wired (`src/routes/messages.ts:543`, 21 handlers)
- ✅ GM role switching has runtime effect (GM-guided creation flow: new-chat "Game Master guided story" toggle pre-sets `assistantRole:gm` + `mode:story` and auto-opens settings; story-mode generation runs `GameMasterService`)
- ❌ Tool call display in chat bubbles

### Backend: 🟡 Partial

- ✅ GameMasterService wired into story-mode generation (`auto-gen.ts:184,792` — see `TASK-wire-gm-service-story-mode.md`)
- ✅ `/create` LLM entity generation command (char/loc/world/item)
- 🟡 **System prompts config-driven** — assistant + gm prompts resolved via `resolveSystemPrompt()` (`src/prompts/registry.ts`, 12 purposes, `configs/templates/llm.yaml` override) shipped `9aefe593`; `.plan/epics/epic-config-templates.md` + `TASK-prompt-template-registry.md` harden typing/defaults/validation. **Inline strings in `/create` generation commands remain** (`src/assistant/prompt/templates/` still absent) — those are entity-gen prompt bodies, not system prompts; separate gap.
- ❌ No quality validation pipeline
- ❌ No confirmation gating
- ✅ GmConfig shape gap CLOSED: chat settings author `GameMasterConfig.type` (llm/human/hybrid) + `llmConfig` (model/provider/temperature/maxTokens) + `actorModels` (per-actor model/provider); `story-mode.ts` resolves the per-actor provider per generation call (commit `022f9a82`)

## Reference

- Spec: `docs/spec/assistant-commands.md`

## Scope

- Character generation via assistant
- Item generation via assistant
- World/location generation via assistant
- API call integrations (external services)
- Confirmation gating (user approval)
- Quality gating (validation, consistency)
- **GM-guided story creation** — user as GM, guiding LLM characters in chat/group-chat to collaboratively create a story

## Design

### Generation Flow

```
User request → Assistant processes → Generate content → Quality check → User confirmation → Create entity
```

### Quality Gating

| Gate              | Check                  | Action               |
| ----------------- | ---------------------- | -------------------- |
| Schema validation | Valid data structure   | Reject if invalid    |
| Consistency check | Matches world/setting  | Warn if inconsistent |
| Duplicate check   | No existing duplicates | Warn if duplicate    |
| User confirmation | Explicit approval      | Require approval     |

## Tasks

- [ ] Character generation prompt templates
- [ ] Item generation prompt templates
- [ ] World/location generation prompt templates
- [ ] API call integration framework
- [ ] Confirmation dialog component
- [ ] Quality validation pipeline
- [ ] Generated content preview
- [x] GM-guided creation flow shipped (new-chat toggle pre-sets GM role + auto-opens settings; story-mode orchestration via `GameMasterService`) — see `TASK-assistant-gm-flows-reconciliation.md`; full gmGuidance UX (scene/constraints/target) in `TASK-gm-guided-story-creation.md` (orchestrator consumption pending)

## AI Director / Narrative Pacing (Extension — Research-Driven)

The Stanford Generative Agents paper demonstrates that narrative pacing emerges
from NPC planning and interaction decisions. An AI Director system provides
explicit control over story tension, pacing, and dramatic structure.

### AI Director Concept

Inspired by Left 4 Dead's AI Director, the system monitors story state and
adjusts NPC behavior, event frequency, and tension to create a satisfying
narrative arc.

### Tension Management

The AI Director tracks and manages story tension through:

1. **Tension curve** — a dramatic arc (rising action → climax → resolution)
2. **Event pacing** — control frequency and intensity of events
3. **NPC behavior** — adjust NPC aggression, helpfulness, mystery
4. **Resource scarcity** — control availability of items, information, allies

```typescript
interface TensionState {
  current_tension: number;     // 0–100: current tension level
  target_tension: number;      // 0–100: where tension should be
  tension_curve: TensionPoint[]; // planned dramatic arc
  pace_modifier: number;       // -100 to 100: slow down or speed up
  last_event_time: Date;
  events_since_last_rest: number;
}

interface TensionPoint {
  timestamp: Date;
  tension_level: number;       // 0–100
  event_type: "rising" | "climax" | "falling" | "rest";
  description: string;
}
```

### Narrative Arc Templates

Pre-defined story structures the AI Director can follow:

```typescript
interface NarrativeArc {
  id: string;
  name: string;
  description: string;
  phases: NarrativePhase[];
}

interface NarrativePhase {
  name: string;
  duration_minutes: number;
  tension_range: [number, number]; // min–max tension
  event_types: string[];           // allowed event types
  npc_behavior: {
    aggression: number;            // 0–100
    helpfulness: number;           // 0–100
    mystery: number;               // 0–100
  };
}
```

### Event Pacing

The AI Director controls event frequency based on tension:

1. **High tension** — frequent, intense events (combat, betrayal, crisis)
2. **Medium tension** — moderate events (conversations, discoveries, choices)
3. **Low tension** — rest events (shopping, exploration, character development)

```typescript
interface EventPacing {
  tension_level: number;       // 0–100
  event_frequency: number;     // events per hour
  event_intensity: number;     // 0–100: how dramatic
  rest_probability: number;    // 0–1: chance of rest event
  npc_aggression_modifier: number; // -50 to 50
  npc_helpfulness_modifier: number; // -50 to 50
}
```

### Poignancy Scoring

Events are scored for narrative importance (poignancy):

```typescript
interface PoignancyScore {
  event_id: string;
  score: number;               // 0–100: how memorable/impactful
  factors: {
    novelty: number;           // 0–100: how unexpected
    emotional_impact: number;  // 0–100: how it affects characters
    plot_significance: number; // 0–100: how it advances the story
    character_development: number; // 0–100: how it changes characters
  };
}
```

### Dynamic Difficulty Adjustment

The AI Director adjusts difficulty based on player performance:

1. **Player struggling** — reduce event intensity, increase helpful NPCs
2. **Player succeeding** — increase event intensity, add complications
3. **Player bored** — introduce new mysteries, NPCs, or challenges

```typescript
interface DifficultyAdjustment {
  player_performance: number;  // 0–100: how well they're doing
  adjustment_type: "increase" | "decrease" | "maintain";
  modifiers: {
    event_intensity: number;   // -50 to 50
    npc_aggression: number;    // -50 to 50
    resource_scarcity: number; // -50 to 50
    mystery_level: number;     // -50 to 50
  };
}
```

### Integration with GM System

The AI Director works alongside the GM system:

1. **GM override** — GM can manually adjust tension, pacing, difficulty
2. **GM suggestions** — AI Director suggests events, NPC behaviors, story beats
3. **GM collaboration** — AI Director and GM work together to create narrative

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-ai-director-tension | Tension tracking and management system | High | Not Started |
| TASK-ai-director-arc | Narrative arc templates and pacing | Medium | Not Started |
| TASK-ai-director-event | Event pacing and poignancy scoring | Medium | Not Started |
| TASK-ai-director-difficulty | Dynamic difficulty adjustment | Medium | Not Started |
| TASK-ai-director-gm | Integration with GM system | High | Not Started |
| TASK-ai-director-tests | Tension, arc, event, difficulty tests | High | Not Started |

### Open Questions

1. Should the AI Director be visible to players, or operate invisibly?
2. How should the AI Director handle player agency vs narrative control?
3. Should the AI Director learn from player preferences over time?
4. How should the AI Director handle multiple players with different preferences?
5. Should the AI Director be able to override NPC autonomy for narrative purposes?

## Pre-compiled Templates Message/Context Injection (Extension)

Many creative generation processes share a recurring shape: each carries (a) an *internal schema* describing the expected output structure, and (b) an *example / scenario* illustrating a canonical filled instance. Injecting that schema + example into the generation prompt — at the **beginning or end** of the assistant message/context — gives the LLM deterministic, schema-steered guidance, improving output compliance and reducing malformed/partial results.

### Rationale

Creative processes such as character creation, prompt creation, image/video/audio prompting, item/world/location/story creation each carry an internal schema and a worked example. Appending (or prepending) that schema-as-example to the assistant message adds deterministic clarity to the creative process and yields schema-compliant / schema-steered documents.

### Scope (creative processes)

- Character / item / world / location creation — entity generation via `resolveEntityGenerationPrompt`
- Story creation
- Prompt creation (generic)
- Image / video / audio prompting

### Mechanism

1. **Pre-compiled template registry** — per creative-process kind, a `{ schema, example }` pair (schema = compact field spec; example = one canonical filled instance / scenario).
2. **Injection helper** — assemble `baseInstruction` + schema+example block with configurable `position: "before" | "after"` (default `after`); `off` disables.
3. **Configurable** via `config.templates.llm.entityGenerationInject` for entity kinds; generalizes to other flows later.

### Integration

- Extend `resolveEntityGenerationPrompt` (already the single source of truth for entity-gen prompts) to embed the precompiled schema+example.
- **Precondition:** `src/assistant/commands/create.ts` currently uses inline `entityPrompts` + `generateEntityData` and does **not** import `resolveEntityGenerationPrompt` — the centralized template system is orphaned from the command flow. Wiring `create.ts` to the centralized builder is part of this work (closes the cutover gap from the quality-gating effort).

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-precompiled-templates-injection | Pre-compiled template registry + injection helper + wire into `/create` | Medium | Not Started |
| TASK-precompiled-templates-story | Extend injection to story creation | Low | Not Started |
| TASK-precompiled-templates-media | Extend injection to image/video/audio prompting | Low | Not Started |
| TASK-precompiled-templates-tests | Position / config-override / precedence tests | Medium | Not Started |

### Open Questions

1. Example representation: literal JSON sample vs. natural-language scenario? Proposal: both — compact schema block + one worked example.
2. Should examples be per-world / per-setting overridable? Deferred.
3. Default injection position: `after` (instruction stays prominent) vs `before`?

## Files

- `src/assistant/commands/generate.ts` — generation commands
- `src/assistant/prompt/templates/` — prompt templates
- `src/components/generation-preview.html` — preview component
- `src/validation/` — quality validation

## Acceptance Criteria

- [ ] Generation commands for characters, items, worlds, locations
- [ ] Quality validation catches schema errors and inconsistencies
- [ ] User confirmation required before entity creation
- [ ] Generated content preview shows what will be created
- [ ] Tests passing
- [ ] GM-guided story creation: user can direct characters in group chat, set scene constraints, control turn order

## Related Epics

### Story Steering & Notes

- `epic-gm-shadow-notes.md` — **direct dependency**. Whitenotes and shadow notes steer LLM generation. GM/assistant creates shadow notes to influence narrative without player visibility. This epic generates the content; shadow notes steer *how* it's generated.

### Narrative Agency

- `epic-agency-story-points.md` — player meta-currency (Bennies/Fate Points) spent to influence generation. Connects to quality gating: player can spend points to override or enhance generated content.
- **Gm-guided story creation** — user as GM with direct narrative control; complement to the agency/points system

### Content Generation Targets

- `epic-character-core-system.md` — character generation output targets this system's data model
- `epic-items.md` — item generation output targets item system
- `epic-worlds-extension.md` — world generation output targets world system
- `epic-locations.md` — location generation output targets location system
- `epic-npcs.md` — NPC generation inherits from actor model

### Supporting Systems

- `epic-actors.md` — all generated entities become actors
- `epic-rpg-mechanics.md` — stat generation follows RPG rules
- `epic-plugin-system.md` — generation may use plugins for custom templates

### Story-Mode UI

- `epic-story-mode-ui.md` — story mode frontend GM panel, turn order, quest log; GM-guided story uses this infrastructure

Autonomy loop + rate governance for GM/actor self-driving: epic-actor-autonomy-story-drive.md.

## Tickets

- `TASK-assistant-gm-flows.md` — main implementation tasks
- `TASK-assistant-gm-flows-reconciliation.md` — reconciliation tasks
- `TASK-gm-guided-story-creation.md` — user as GM guiding LLM characters in chat/group-chat to create a story together
- `TASK-precompiled-templates-injection.md` — pre-compiled schema+example prompt injection for creative generation processes
