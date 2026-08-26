<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Workflow Engine

**Status:** ⬜ Not Started
**Priority:** High (MVP scoped, post-Gate C)
**Effort:** Large
**Type:** Feature Epic
**Tags:** assistant, workflows, templates, intent-detection, yaml
**Parent Epic:** Assistant Creative Studio — Workflow Templates (epic-assistant-creative-studio-workflows.md)
**Depends on:** Configurable Template System (`epic-config-templates.md`), Assistant/GM Flows (`epic-assistant-gm-flows.md`)
**Spec:** `docs/spec/assistant-commands.md` (may drift — `src/` is authoritative)

## Summary

The core workflow template engine: schema definition, multi-file directory discovery in the template loader, runtime flow, intent-to-workflow routing, and approval/quality-gate plumbing. **Prerequisite for all sibling sub-epics** — model family presets, entity generation workflows, and gallery batch operations all plug into this engine.

## Design

### Template Schema (§7.1)

Stored as YAML in `configs/templates/workflows/*.yaml`, loaded by an extension to the
existing template loader pipeline (`src/config/templates-loader/index.ts` +
`src/config/sections/templates.ts`). Each workflow is a named, versioned template with
metadata, step definitions, parameter slots, backend dispatch, and approval policy.
Full schema example: see parent epic §7.1 (`configs/templates/workflows/minimax-h3-video.yaml`).

### Multi-File Directory Discovery

**Loader limitation to fix:** the current template loader
(`src/config/templates-loader/discovery.ts`) uses a `TEMPLATE_FILES` map that maps
*single filenames* to domains (e.g. `"llm.yaml"` → `"llm"`). Workflows introduce a
**multi-file directory** pattern (`configs/templates/workflows/*.yaml`) that requires a
new directory-scanning discovery mechanism — `findTemplateFiles()` does not currently
recurse into subdirectories or collect multiple files per domain.

### Runtime Flow (§7.2)

```
User message
  → classifyIntent (src/regex/intent.ts or LLM classifyIntent in auto-gen.ts)
    → match against workflow.trigger rules
  → if workflow intent matched:
    → AssistantCreativeStudio.startWorkflow(workflowId)
      → Phase 1: Preview steps (titles, descriptions, recommendations)
      → Phase 2: Step-by-step prompt building (user fills each step)
      →   Assistant validates + recommends per step
      → Phase 2b: Format transformation — apply model_family preset formatter
        (see epic-model-family-presets.md)
      → Phase 3: Final confirmation prompt
      →   User confirms → Dispatch (backend + payload_template)
      →   User cancels → Abort
  → else: fall through to chat / standard command path
```

### Sourceable / Configurable (§7.3)

- **Default workflows** ship in-source as YAML (bundled at build time).
- **User override** via `configs/templates/workflows/*.yaml` using the same merge
  strategies (`replace` | `extend` | `override`) from `epic-config-templates.md`.
- **Plugin extensibility:** the workflow registry is a
  `PluginExtensionPoint<"assistant-workflows">` (see `epic-plugin-system.md`).

### Intent Detection Integration (§7.4)

The existing `AssistantIntent` taxonomy (`src/regex/intent.ts`) defines
`"generate" | "tool_exec" | "api_call" | "chat"`. Workflow templates extend this:

- `workflow.intent.type` maps to one of the four `AssistantIntent` values.
- The existing `INTENT_PATTERNS` constant (keyword regex array) is **extended** with
  workflow trigger patterns — but only for `generate` workflows. `tool_exec` and
  `api_call` workflows require the approval policy in the template to specify the
  allowlist/policy gate (per `epic-assistant-generation-extensions.md` Phase 4).
- Intent-to-workflow routing is config-driven only — no standalone regex classifier
  module (the dead `detectIntent()` / `APPROVED_TOOLS` code stays removed).

### Approval / Quality Gates

Workflow `approval` blocks (`type: confirm`, `preview`, `quality_gates[]`) reuse the
quality-gating pattern from `epic-assistant-gm-flows.md`: gate types (`schema`,
`consistency`, `duplicate`) run before dispatch; user confirmation gates dispatch
itself. Sibling sub-epics add gate types but do not change the plumbing.

### NSFW Policy at Dispatch

Third-party image/video generation backends enforce NSFW restrictions differently.
Workflow `dispatch` carries an `nsfw_policy` block (classification required, allowed,
consent required, label field, fallback backend list) integrated with `src/nsfw/`
moderation and `epic-nsfw-capabilities.md` consent infrastructure.

> **Bridge:** NSFW ratings/consent/age-gate: see `epic-nsfw-capabilities.md`; moderation enforcement: see `epic-nsfw-moderation-priority.md`.

## Tasks

- [ ] Define `WorkflowConfig` types in `src/config/sections/templates.ts`
- [ ] Add workflow template loading to `src/config/templates-loader.ts`
- [ ] Extend template loader discovery for multi-file directories (`configs/templates/workflows/*.yaml`)
- [ ] Create `configs/templates/workflows/defaults.yaml` with Minimax H3 example
- [ ] Extend `src/regex/intent.ts` `INTENT_PATTERNS` with workflow trigger rules
- [ ] Implement `src/assistant/workflow-runner.ts` (start/preview/step/confirm/dispatch)
- [ ] Implement step validation + recommendation engine
- [ ] Wire dispatch to `POST /api/generation/video` + existing generation pipelines
- [ ] Add NSFW policy field to dispatch + integrate with `src/nsfw/` moderation
- [ ] Frontend: creative studio step UI + confirmation modal
- [ ] Plugin extension point for assistant workflows
- [ ] Unit tests for loader, step validation, intent→workflow routing
- [ ] Integration test: Minimax H3 end-to-end (intent → steps → confirm → dispatch)


- [ ] Step-by-step prompt construction with validation + recommendations
- [ ] Final confirmation required before dispatch
- [ ] Dispatch calls the designated backend/API with assembled payload
- [ ] User intent matches a workflow template and triggers the creative studio flow
- [ ] Assistant previews prompt steps + recommendations before building
- [ ] Applicable to other assistant workflows (not just one use case)
- [ ] Plugin can register additional workflows
- [ ] Workflow templates are config-driven (YAML in `configs/templates/workflows/`)
## Dependencies

- **Parent hub:** Assistant Creative Studio — Workflow Templates (`epic-assistant-creative-studio-workflows.md`)
- **Blocks:** `epic-model-family-presets.md` (formatter hooks into Phase 2b),
  `epic-entity-generation-workflows.md` (entity templates are workflow instances),
  `epic-gallery-batch-operations.md` (batch modeled as an optional workflow).
- External prerequisite: `TASK-assistant-command-execution-intent-detection.md`
  (fixes `classifyIntent` timeout/apiKey — blocking dependency for intent routing).

## Related Epics

- `epic-config-templates.md` — template loader + merge strategies backbone
- `epic-assistant-gm-flows.md` — quality/confirmation gating pattern
- `epic-plugin-system.md` — plugin extension point
- `TASK-assistant-third-party-api-integration.md`, `TASK-assistant-nsfw-api-prefiltering.md` — dispatch adapters & NSFW prefiltering
