<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison workflow template and /compare assistant command

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-fan-out-engine.md`, `TASK-comparison-set-routes-crud-ownership-validation.md`, `TASK-workflow-engine-schema-loader-template-types-workflow-discov.md`, `TASK-workflow-runner-start-preview-step-confirm-dispatch-step-ui.md`, `epic-assistant-creative-studio-workflows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Ship `configs/templates/workflows/comparison-models.yaml` plus a `/compare` chat command so a user can
start a model comparison from chat, with the run's outputs linked back into the chat as ordinary
assets.

## Context

Workflow templates are multi-file YAML under `configs/templates/workflows/` — verified 2026-10-16 that
this directory currently holds only `defaults.yaml`, `entities.yaml`, and `entity-types.yaml`.
`findWorkflowFiles` (multi-file discovery, `src/config/templates-loader/discovery.ts:84`) picks up any
new file; `mergeWorkflowConfig` and `validateWorkflowConfig` merge and validate it
(`src/config/workflow-templates.test.ts` is the existing template test suite). See
`TASK-workflow-engine-schema-loader-template-types-workflow-discov.md` (Done) for the landed schema
slice.

Shape the YAML against the real types in `src/config/sections/templates-workflow.ts`:

- `AssistantWorkflowConfig` (`:61`) — `id`, `name`, `description`, `triggers`, `intent`
  (`WorkflowIntentConfig`: `type` from the `AssistantIntent` taxonomy + `target`), `modelFamily`,
  `steps`, `dispatch`, `approval`.
- `WorkflowStepConfig` (`:22`) — `type` is the closed union `"text" | "choice" | "multi"`; each step
  carries `formatTemplate`, `required`, `recommendations`, `options`.
- `WorkflowDispatchConfig` (`:45`) — `backend`, `target` (the dispatch target, declared at `:48` — here
  `POST /api/comparison-sets`), `payloadTemplate` (where `{prompt}` is substituted by
  `confirmAndDispatch`, `src/assistant/workflow-runner.ts:143`), `nsfwPolicy`.
- `WorkflowApprovalConfig` (`:55`) — `type: "confirm" | "auto"`, `preview`.

Steps for the comparison template: prompt (text), optional reference asset (text/choice), comparison
axis (choice — `model` / `seed` / `steps` / `cfg` / `resolution`), and backend set (choice). The
template declares *intent*; the concrete variant list is posted to the route. This is deliberate — see
the fan-out decision in the epic's ## Design and `TASK-comparison-fan-out-engine.md`. **Do not add a
new `WorkflowStepConfig.type`.**

Routing: `matchWorkflowTrigger` (`src/assistant/workflow-routing.ts:51`) matches `triggers`
case-insensitively, first template in load order wins; the slash command path is `SLASH_COMMAND` from
`src/regex/intent.ts`, dispatched via `src/routes/messages/command.ts` and the command handler at
`src/assistant/commands/workflow.ts`.

`modelFamily` may be omitted: `configs/templates/workflows/model-families.yaml` does not exist yet
(`epic-model-family-presets.md` is Not Started — verified 2026-10-16), so a template that declares a
`modelFamily` would resolve to a missing preset. Leave it out and add it when the presets land.

Chat linking: reuse the existing pattern in `handleImageGeneration`
(`src/generation/image-gen-route.ts:159-166`) which builds `[{ entityType: "message", entityId,
label: "generated" }, { entityType: "chat", ... }]` and passes it to `persistGeneratedImages`. Comparison
outputs link the same way plus a `comparison_set` link, so they appear in the gallery through the
ordinary asset-link path with no special casing. The `AssetLinkEntity` union
(`src/db/enums-content.ts:73`) has no `comparison_set` entry today — adding it is part of
`TASK-comparison-gallery-comparison-set-integration.md` and is a prerequisite for the gallery filter
to accept the type.

## Acceptance Criteria

- [ ] `configs/templates/workflows/comparison-models.yaml` exists and is discovered by `findWorkflowFiles` without loader changes
- [ ] The template validates against `validateWorkflowConfig` (a case in `src/config/workflow-templates.test.ts`)
- [ ] Every step in the template uses a `type` from the existing `"text" | "choice" | "multi"` union; `WorkflowStepConfig` is unmodified
- [ ] `dispatch.target` is `POST /api/comparison-sets` and `confirmAndDispatch` returns it verbatim (`src/assistant/workflow-runner.ts:149`)
- [ ] A chat message matching the template's `triggers` routes to it via `matchWorkflowTrigger` (`src/assistant/workflow-routing.ts:51`)
- [ ] `/compare` as a slash command reaches the template through `src/routes/messages/command.ts`
- [ ] Comparison outputs are linked with `entityType: "message"`, `"chat"`, and `"comparison_set"`, and are visible in the gallery's asset-link filter
- [ ] The template declares no `modelFamily` (the presets file does not exist yet)
