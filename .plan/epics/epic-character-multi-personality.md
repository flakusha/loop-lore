<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Assistant Personality — Presets & Character-as-Assistant

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** assistant, personality, presets, character, gm, tone-of-voice, scenario
**Related:** epic-character-core-system, epic-character-internal-traits, epic-character-multi-personality-system, epic-assistant-gm-flows, epic-aux-enrichment-pipeline, epic-prompt-template-registry

**Overview:**

The assistant/GM inherits one of three personality sources per chat/world:

1. **Server default** — no extra prompt block; back-compat.
2. **Canonical preset** — pick from 10 voice keys (serious, helpful, quirky, fun, melancholic, snarky, nurturing, horror, stoic, ecstatic).
3. **Character-as-assistant** — an existing character card becomes the GM voice; reuses the in-chat character composer path.

The composer reads the active `AssistantPersonalityState` and emits the appropriate block. The auxiliary LLM (`epic-aux-enrichment-pipeline` `personality` task) scores drift and emits an advisory when assistant speech diverges from the chosen voice.

## Summary


The assistant/GM in a chat or world can wear one of several canonical
personalities (serious, helpful, quirky, fun, melancholic, snarky,
nurturing, horror, …) — OR take on the personality of an existing
character (character-as-assistant scenario). The choice shapes prompt
assembly: tone rules, vocabulary bias, scenario/welcome-message seeding,
system-prompt injection, and emotion expression.

This epic creates the missing bridge between the canonical personality
presets and the persona/character system, so the same character-generation
pipeline can drive both the main conversational character and the
assistant/GM slot.

## Scope

- Canonical personality presets (serious / helpful / quirky / fun / melancholic / snarky / nurturing / horror / stoic / ecstatic)
- Preset metadata: voice, tone, scenario seeds, vocabulary hints
- Per-chat and per-world assistant-personality override
- Character-as-assistant scenario: reuse a character card as the GM voice
- Assistant personality editor UI (pick preset vs pick character)
- System-prompt composer emits preset or character persona prompt
- Personality continuity across chats (preset choice persists per user)
- Personality drift detection (auxiliary LLM-driven; reuses aux-pipeline)
- Reset personality (back to server default)
- Aux-driven drift advisory (auxiliary LLM flags when assistant drifts from chosen personality)

## Key Integrations

| System | What It Provides | How This Epic Uses It |
| ------ | ---------------- | --------------------- |
| Character Core System | Character cards, traits, personality | Pick-a-character-as-assistant reads character card |
| Character Internal Traits | Coping, mood, behavioral dimensions | Personality preset borrows axes from this layer |
| Assistant / GM Flows | GM chat, prompt assembly, command surface | Wire preset/character selector into GM role |
| AUX LLM Enrichment Pipeline | Personality drift detector | Reuse detector (and fix `aux.personality` enable bit) |
| Prompt Template Registry | System-prompt assembly | Inject preset voice + character persona blocks |
| Persona Service | Persona-to-character conversion | Character-as-assistant flows through persona->character |

## Tasks

- [ ] Personality presets catalog (8-12 canonical presets, voice + tone + scenario seeds)
- [ ] Personality preset selector (chat/world assistant settings)
- [ ] Character-as-assistant selector (pick a character card as assistant)
- [ ] System-prompt composer integration (preset block + character persona block)
- [ ] Per-chat and per-world assistant-personality override
- [ ] Personality continuity across chats (per-user default persisted)
- [ ] Auxiliary LLM personality-drift advisory (reuses aux-pipeline personality task)
- [ ] Reset-to-default personality command
- [ ] Assistant personality editor UI (preset grid + character picker)
- [ ] Tests (server-side composer, aux drift, persona continuity)

## Design

### Personality Preset

```typescript
interface PersonalityPreset {
  id: string;
  key: "serious" | "helpful" | "quirky" | "fun" | "melancholic" | "snarky" | "nurturing" | "horror" | "stoic" | "ecstatic";
  displayName: string;
  voice: {
    tone: string[]; // vocabulary cues: "measured", "clinical", "warm", ...
    formalityLevel: 0 | 1 | 2 | 3 | 4; // 0 = clipped, 4 = ceremonial
    humorLevel: 0 | 1 | 2 | 3 | 4;
    emotionBandwidth: number; // 0..100 expressive range
    vocabularyHints: string[]; // bias tokens (no hardcoded slurs etc.)
  };
  scenarioSeeds: string[]; // welcome-message templates and scenario presets
  promptBlocks: string[]; // system-prompt fragments appended to base prompt
  defaultMood: string; // preset default mood palette seed
}
```

### Assistant Personality Binding

```typescript
type AssistantPersonalitySource =
  | { kind: "preset"; presetKey: PersonalityPreset["key"] }
  | { kind: "character"; actorId: string }
  | { kind: "server-default" };

interface AssistantPersonalityState {
  chatId: string;
  source: AssistantPersonalitySource;
  lockedAt: number | null;
  driftScore: number; // 0..1 from aux; >0.5 emits advisory
  advisoryEnabled: boolean;
}
```

### Prompt Composer (concept)

The composer reads the active `AssistantPersonalityState` and emits the
appropriate block:

- `preset` → emit `PersonalityPreset.promptBlocks`
- `character` → emit full character persona block (same code-path as in-chat character)
- `server-default` → empty (no extra block)

## Open Questions

- User-defined custom presets (allow-list or free-form taxonomy)?
- Per-character-mode override (story mode vs chat mode vs GM mode)?
- Should character-as-assistant preserve that character's relationship with the player-character?

## Bind Tickets

- TASK-assistant-personality-presets-catalog
- TASK-assistant-personality-selector-ui
- TASK-character-as-assistant-pick-character-as-gm
- TASK-assistant-personality-composer-integration
- TASK-assistant-personality-drift-aux-advisory
- TASK-assistant-personality-continuity-across-chats
