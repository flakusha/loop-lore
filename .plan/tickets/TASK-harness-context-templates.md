<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness context templates (purposes + harness YAMLs)

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Harness context builds as new PromptPurpose keys + new workflow YAMLs — both reusing existing patterns with zero loader/assembler changes.
**Context:** Two-tier reuse: purpose-keyed prompts (`prompts/registry.ts` LLM_PROMPT_DEFAULTS + `resolveSystemPrompt`, 16 purposes in `purposes.ts`) and stored templates (FEAT-065: `generation/template-service/crud|resolve|apply`, `{{variable}}` substitution, `llm|image|video|audio|workflow` modalities, `workflow-library/` + validator); config loader reads `configs/templates/*.yaml` + `workflows/*.yaml`; entity workflows in `entities.yaml` (triggers→intent→steps→dispatch→approval); assembly cascade + `assembleWithTemplate()` + token-budget in-assembler.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] New `PromptPurpose` keys (`harnessCode|harnessEdit|harnessReview|harnessCreative|harnessImage|harnessVideo`) via the exact `purposes.ts` + `LLM_PROMPT_DEFAULTS` pattern; config-overridable via `configs/templates/llm.yaml` from day one; no loader change.
- [ ] New workflow YAMLs (e.g. `harness-small-agent.yaml`: trigger phrase → steps → dispatch backend `omp` → approval preview) reusing the `entities.yaml` schema; validator + loader handle them untouched.
- [ ] Per-task override reuses `assembleWithTemplate()` (falls back to PROMPT_SECTIONS); image/video prompts reuse `applyImageTemplate` + `validateWorkflowPayload` (no new renderers).
- [ ] Only story/art purposes exist today — no coding/editing/creative presets; this ticket adds exactly those, nothing more.

## Related Files

- `src/prompts/purposes.ts`, `registry.ts`, `src/generation/template-service/`, `src/assistant/prompt-assembler.ts`, `prompt/template-render.ts`
- `configs/templates/`, `configs/templates/workflows/entities.yaml`, `entity-types.yaml`, `defaults.yaml`
- `epic-config-templates.md`, `epic-context-injection-templates.md` (neighbor, not parent)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
