<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workflow engine schema + loader (template types, workflow discovery, defaults)

**Status:** ✅ Done (shipped: WorkflowTemplateConfig + step/dispatch/approval types in src/config/sections/templates.ts; findWorkflowFiles multi-file discovery; mergeWorkflowConfig; validateWorkflowConfig; loader wiring; configs/templates/workflows/defaults.yaml with Minimax H3 example; 15 tests with runner slice in src/config/workflow-templates.test.ts. Deferred: ModelFamilyPreset matrix + model-families.yaml — new follow-up.)
**Priority:** high
**Effort:** Medium

## Summary

Parent: TASK-assistant-creative-studio-workflows.md Phase 1; epic-assistant-creative-studio-workflows (Workflow Engine sub-epic). The engine has no implementable slice tickets - only the monolithic Draft parent. Scope: WorkflowTemplateConfig + ModelFamilyPreset types in src/config/sections/templates.ts; workflow + model-family loading in src/config/templates-loader.ts (multi-file configs/templates/workflows/*.yaml discovery); configs/templates/workflows/defaults.yaml with Minimax H3 example; merge strategies (replace/extend/override) verified for workflows; unit tests for loader + step validation. Out of scope: runner (separate ticket), intent routing, dispatch backends. Acceptance: schema defined; loader discovers/merges workflow files; defaults.yaml loads; bun test src/ + bun run check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
