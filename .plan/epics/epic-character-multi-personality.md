<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Assistant Personality — Presets & Character-as-Assistant

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7` — by file existence on `dev`, line-level reads of each cited path, and a `git log dev..<branch>` check that excludes unmerged work). The previous "Not Started" note in this file (dated 2026-10-09) was false on its first claim: `src/assistant/personality/` DOES exist, landed in commit `1793c87c1` the same day. SHIPPED AND LIVE: the ten-preset catalog (`src/assistant/personality/presets.ts:15`, with `findPersonalityPreset` at `:173` and `isPersonalityPresetKey` at `:182`); the composer — binding parsing, state resolution and block emission (`src/assistant/personality/composer.ts:50`, `:75`, `:88` and `:110`, including the character-as-assistant path at `:168` and the drift advisory at `:189`); the types module; and the prompt wiring, which makes the whole feature live: `resolvePersonalityState` is called from `src/assistant/prompt-personality.ts:33`, which `src/assistant/prompt-assembler.ts:293` invokes on every assembly, feeding the registered `assistantPersonalitySection` (`src/assistant/prompt/sections/assistant-personality.ts:14`, registered at `src/assistant/prompt/registry.ts:59`). The binding lives in the chat's `gm_config` blob under `assistantPersonality` (`composer.ts:32`). Unit coverage ships (`src/assistant/personality/composer.test.ts`, `src/assistant/prompt-personality.test.ts`, `src/assistant/prompt/sections/assistant-personality.test.ts`). REMAINS: no selector UI, no continuity/persistence, no aux drift pipeline. There is no `user_assistant_personality` table anywhere in `src/`, no `assistant-personality-picker` Alpine component, and no `personality` task in `src/aux-pipeline/` (the composer computes a drift advisory from a `driftScore` that nothing yet supplies). `convertToCharacter` exists in the persona service (`src/personas/service.ts:163`) but the character-as-assistant composer path does not reuse it. Of the six bound tickets, only the presets catalog is complete; the other five are Not Started.
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** assistant, personality, presets, character, gm, tone-of-voice, scenario
**Related:** `epic-character-core-system.md`, `epic-character-internal-traits.md`, `epic-assistant-gm-flows.md`, `epic-aux-enrichment-pipeline.md` (aux `personality` drift task — `TASK-aux-personality-drift.md`), `epic-config-templates.md` (prompt template registry / system-prompt assembly)

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
| AUX LLM Enrichment Pipeline | Personality drift detector | Reuse detector once it exists — the aux `personality` task is not built yet (`TASK-aux-personality-drift.md`, owned by `epic-aux-enrichment-pipeline`) |
| Prompt Template Registry | System-prompt assembly | Inject preset voice + character persona blocks |
| Persona Service | Persona-to-character conversion | Character-as-assistant flows through persona->character |

## Tasks

(status verified 2026-10-18 against `dev`)

- [x] Personality presets catalog (8-12 canonical presets, voice + tone + scenario seeds) — `src/assistant/personality/presets.ts`
- [ ] Personality preset selector (chat/world assistant settings)
- [ ] Character-as-assistant selector (pick a character card as assistant) — composer-side rendering ships (`composer.ts:168`); no picker UI
- [x] System-prompt composer integration (preset block + character persona block) — `composer.ts`, `sections/assistant-personality.ts`, wired at `prompt-assembler.ts:293`
- [ ] Per-chat and per-world assistant-personality override — per-chat only, via the chat's `gm_config` blob; no world-level override
- [ ] Personality continuity across chats (per-user default persisted) — no `user_assistant_personality` table exists
- [ ] Auxiliary LLM personality-drift advisory (reuses aux-pipeline personality task) — no `personality` task in `src/aux-pipeline/`; `driftScore` is never populated in production
- [ ] Reset-to-default personality command
- [ ] Assistant personality editor UI (preset grid + character picker)
- [ ] Tests — composer/section/prompt-wiring tests ship; aux drift and persona-continuity tests do not

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

## Acceptance Criteria

(status verified 2026-10-18 against `dev`)

- [x] 8-12 canonical personality presets defined with voice, tone, and scenario seeds — `src/assistant/personality/presets.ts:15` (10 presets), pinned by `composer.test.ts:115`
- [ ] Per-chat and per-world assistant-personality override functional — per-chat works (`gm_config.assistantPersonality`); no world-level override
- [ ] Character-as-assistant selector picks an existing character card as GM voice — the composer renders a character voice (`composer.ts:168`) but no selector UI exists to pick one
- [x] System-prompt composer emits preset block or character persona block based on active state — `composePersonalityBlock` (`composer.ts:110`), wired at `prompt-assembler.ts:293`
- [ ] Personality continuity persists per-user default across chats — no persistence layer
- [ ] Auxiliary LLM personality-drift advisory emits when assistant speech diverges from chosen voice — advisory rendering ships (`composer.ts:189`) but no aux task feeds `driftScore`
- [ ] Reset-to-default personality command restores server-default behavior — absent
- [ ] Assistant personality editor UI provides preset grid + character picker — absent
- [ ] Tests cover server-side composer, aux drift, and persona continuity — composer/section tests ship; drift and continuity tests do not

## Files (proposed — status verified 2026-10-18 against `dev`)

- `src/assistant/personality/presets.ts` — canonical personality preset catalog — **SHIPPED**
- `src/assistant/personality/selector.ts` — per-chat/world personality override
- `src/assistant/personality/composer.ts` — system-prompt composer integration — **SHIPPED** (plus `src/assistant/prompt-personality.ts` and `src/assistant/prompt/sections/assistant-personality.ts`)
- `src/assistant/personality/drift.ts` — auxiliary LLM drift advisory
- `src/assistant/personality/continuity.ts` — per-user default persistence
- `src/assistant/personality/reset.ts` — reset-to-default command
- `src/frontend/alpine/personality-editor/` — personality editor UI
