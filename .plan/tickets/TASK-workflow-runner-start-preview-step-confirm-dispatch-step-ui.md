<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workflow runner (start/preview/step/confirm/dispatch + step UI)

**Status:** 🟡 Partial — core + chat runtime shipped (runner state machine; NEW: src/assistant/workflow-session.ts per-chat runs, src/assistant/commands/workflow.ts `/workflow` status/cancel/confirm + entity dispatch via runCreateGeneration, dispatch hook in src/routes/messages/command.ts covering 1:1 + group-chat post path, 10 dispatch/session tests + 33-file workflow suite green). Remaining: model-family formatter engine, real POST /api/generation/video backend (stub envelope only), frontend step UI + confirmation modal, plugin extension point, session persistence + group-chat mention strip (filed as follow-ups).
**Priority:** high
**Effort:** Medium

## Summary

Parent: TASK-assistant-creative-studio-workflows.md Phase 3; epic-assistant-creative-studio-workflows (Workflow Engine sub-epic); depends on TASK-workflow-engine-schema-loader ticket. Scope: src/assistant/workflow-runner.ts (startWorkflow, previewSteps, buildStep with validation + recommendations, applyModelFamilyFormat, assemblePrompt, confirmAndDispatch with NSFW check); model family formatter engine reading model-families.yaml presets; dispatch wiring to POST /api/generation/video + existing pipelines; frontend src/frontend/creative-studio/workflow.ts step UI + confirmation modal; plugin extension point assistant-workflows; src/assistant/workflow-runner.test.ts + integration test. Out of scope: per-entity templates (covered by TASK-assistant-creative-studio-workflow-{item,character,world,location,npc}.md), third-party adapters, NSFW prefilter service. Acceptance: start->preview->step->confirm->dispatch works end to end; merge overrides apply; bun test src/ + bun run check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
