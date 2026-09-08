<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM: reuse WorkflowRunner for guided entity creation

**Status:** ✅ Done (shipped: configs/templates/workflows/entities.yaml with entity-character/world/location/item/npc guided workflows; findWorkflowById lookup in src/assistant/workflow-routing.ts; assembled prompt feeds /create description keeping generate → quality gates → create-entity-preview confirmation. Verified: 6 workflows load via loadTemplateConfig; no persist-without-approval path added.)
**Priority:** Medium
**Effort:** Medium

## Summary

GM-guided creation (character/world/location/item/NPC) should run on the shipped src/assistant/workflow-runner.ts state machine instead of bespoke prompts. Scope: entity workflow templates in configs/templates/workflows/ per TASK-assistant-creative-studio-workflow-{character,world,location,item,npc}; resolve template by id (runner currently takes a resolved template - add lookup by id from loaded config); confirmation gate before insert (closes TASK-assistant-gm-flows quality-gating gap); GM shadow notes injected as hidden context alongside assembled prompt. Acceptance: /create GM flow goes start-preview-step-confirm-dispatch; tests cover confirm gate.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
