<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character As Assistant Pick Character As GM

**Status:** In Progress
**Status Note:** In Progress (verified 2026-10-18 against `dev` at `08ef7efe7`). One of four acceptance criteria is met; the composer half of the feature ships and is live, the picker half does not exist. Met: the composer emits a character persona block when the binding source is `character` — `resolveVoiceBody` dispatches that case at `src/assistant/personality/composer.ts:141` and `renderCharacter` reads the actor card at `composer.ts:168-182`, emitting name/description/personality/scenario. NOT MET: (a) the picker that lists user-owned characters does not exist — there is no `assistant-personality-picker` Alpine component anywhere in `src/`, so no user can actually select a character; (b) "same code-path as `TASK-character-internal-traits` injection" is not what ships — `renderCharacter` runs its own `selectFrom("actors")` rather than routing through the registered `internalTraitsSection` (`src/assistant/prompt/sections/internal-traits.ts`, registered at `src/assistant/prompt/registry.ts:65`); (c) "`Personality -> Character` conversion reuses `convertToCharacter`; `Character -> Personality` for migration" is unimplemented — `convertToCharacter` exists in the persona service (`src/personas/service.ts:163`) but nothing in `src/assistant/personality/` calls it, and no reverse conversion exists; (d) the two named tests (pick character → prompt changes; pick another → prompt reverts) do not exist — `composer.test.ts:38` only asserts that a `{ kind: "character", actorId }` source parses, it never asserts the emitted block. Remaining: the picker UI, the conversion wiring, and the prompt-change/revert tests.
**Priority:** high
**Effort:** Medium
**Epic:** epic-character-multi-personality
**Tags:** assistant, character, gm

**Summary:**
Pick an existing character card to act as the assistant/GM voice for a chat or world.

**Context:**
The character-as-assistant scenario: instead of a preset tone, the GM is a fully fledged character with traits, lore, and voice. This ticket wires character -> assistant with the same composer path as the in-chat character.

**Acceptance Criteria:**
- Picker (companion to `assistant-personality-selector-ui`) lists user-owned characters plus system characters flagged as GM-eligible.
- Composer emits full character persona block (same code-path as `TASK-character-internal-traits` injection) when source is `character`.
- `Personality -> Character` conversion reuses `convertToCharacter`; `Character -> Personality` for migration path.
- Tests: pick character, assistant prompt changes; pick another, prompt reverts cleanly.
