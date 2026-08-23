<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-config-example-template-variables-doc

**Status**: open
**Priority**: low
**Labels**: config, documentation, templates
**Assignee**:
**Epic**: epic-config-templates
**Related**: `configs/templates/llm.example.yaml`, `configs/templates/llm.example.toml`

## Description

Config example files (`configs/templates/llm.example.*`) don't document
available template variables. Users have no way to know what `{{token}}`
placeholders work in their custom system prompts.

Once the unified template variable engine is implemented (TASK-template-unified-variable-engine),
the example configs should document all available variables with descriptions
and usage examples.

### Acceptance Criteria

- [ ] `configs/templates/llm.example.yaml` includes documented variable table:

  ```yaml
  # Available template variables:
  #   {{charName}}            — Character display name
  #   {{charDescription}}     — Character description/backstory
  #   {{charPersonality}}     — Personality summary
  #   {{charScenario}}        — Roleplay scenario
  #   {{userName}}            — Current user's persona name
  #   {{userDescription}}     — Current user's persona description
  #   {{character.mood}}      — Current mood state
  #   {{character.happiness}} — Happiness level (0-100)
  #   {{character.permanentTraits}} — Core immutable traits
  #   {{character.relationships}}   — Inter-character relationships
  #   ... (all implemented variables)
  ```

- [ ] `configs/templates/llm.example.toml` mirrors YAML docs
- [ ] Each variable has a one-line description
- [ ] Categorized by source (Character, User, Context, Dynamic)
- [ ] Includes example system prompt using variables
- [ ] Note which variables are only available in certain contexts (NSFW traits, group chats, etc.)

### Notes

- This task depends on TASK-template-unified-variable-engine
- Should be the last task — update examples after all variables are wired
- Consider auto-generating the variable list from the template context type definition
