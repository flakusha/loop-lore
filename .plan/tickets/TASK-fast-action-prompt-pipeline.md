<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fast-action command-to-prompt pipeline (/say /action /speak-think)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-chat-commands

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Fast Actions are flow modifiers, not solved mechanics: no dice roll, no `interaction_logs` entry. They work as prompt-engineering templates through a Transformer Module. Design matches the AI Dungeon Do/Say/Story/See model already documented in `epic-rpg-patterns.md` §AI Dungeon interaction model. This ticket is the pipeline + the dialogue/intent-modifier commands; catalog expansion is `TASK-fast-action-utility-catalog`.

## Scope

- Transformer module: command captured → hidden template selected → player text injected (`[NARRATIVE MODE: SPEECH_ONLY] …`) → LLM executes. Lives beside the existing command registry (`src/assistant/commands/registry.ts`), a new template-backed handler kind rather than per-command bespoke code.
- `FastAction` shape: `{ command, type: narrative_modifier | flow_control | utility, hiddenPromptTemplate, requiresParameter, affectsState }`.
- `/say [text]` — pure dialogue, no action assumed; `/action [text]` — pure action, no speech; `/speak-think` — spoken line and internal monologue delivered separately.
- UX rules: invisible to NPCs (never narratively acknowledged unless requested), format-neutral, composable with heavy interactions (e.g. `/draft` → `/pickpocket`).
- Relation to existing commands: `/ooc` and `/narrate` are adjacent but distinct (ooc is meta-communication; `/say` is in-character dialogue). Document the boundary in help text.

## Acceptance Criteria

- [ ] Template-backed command kind in registry; adding a fast action requires only a definition
- [ ] `/say` and `/action` produce observably different prompt instructions (unit test on assembled prompt)
- [ ] Fast actions never create `interaction_logs` rows
- [ ] FE command palette lists them with parameter hints
- [ ] Tests: template selection, parameter injection, no-state-write assertion

## Linked Epics

- `epic-frontend-chat-commands.md`
- `epic-rpg-patterns.md` (AI Dungeon model)
- EPIC-2026-23 Assistant Commands
