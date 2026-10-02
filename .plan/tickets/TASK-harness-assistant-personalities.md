<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness assistant personalities (presets + card split)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Assistant personalities as FEAT-065 template-cascade presets (no new plumbing); split `AgentRoleDefinition` expertise vs voice (SillyTavern V2 shape, reimplemented) + lorebook scoped injectors.
**Context:** Character vs persona systems converge at `prompt-assembler.ts` → `PROMPT_SECTIONS` (28 builders, `prompt/registry.ts`). `personality` is a required ≤2000ch string; `behavioral_modifier:` world traits + internal-traits voice block are the two existing emulation dials. GM behavior stays in `epic-assistant-gm-flows.md`.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Personality presets resolve through `chat.prompt_template_id` → `actor.settings.prompt_template_id` → `PROMPT_SECTIONS` as LLM-modality stored templates (`template-service/resolve.ts`); reviewer/teacher/pair presets ship as rows, not tables.
- [ ] `AgentRoleDefinition` gains `voice` + `examples[]` (mes_example few-shots + alternate greetings) + `lorebook` refs; expertise (`description/scenario`) stays separate from voice (`personality/mes_example/post_history_instructions`).
- [ ] Lorebook injector: regex `keys` + `scan_depth` + `token_budget` + priority/position, reusing embeddings-service FTS — never whole-doc dumps.
- [ ] Dispatch personas ride `convertPersonaToCharacter()` (`personas/service.ts`); at most one new `PROMPT_SECTIONS` entry for a global voice. PNG cards explicitly out.

## Related Files

- `src/assistant/prompt-assembler.ts`, `prompt/registry.ts`, `prompt/sections/plugin-agent-role.ts`, `prompt/presets.ts`
- `src/personas/service.ts`, `convert.ts`, `src/characters/parser.ts`, `services/personality-service/`, `services/internal-traits/`
- `epic-character-multi-personality.md`, `epic-config-templates.md` (FEAT-065 cascade)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
