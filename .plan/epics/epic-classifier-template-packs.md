<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Classifier Template Packs

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** P2
**Effort:** Medium
**Type:** Feature Epic / Configuration
**Tags:** aux-pipeline, classification, templates, config
**Issue:** (none)

## Summary

Give the aux-pipeline's zero-shot classification decision points a typed
registry and a user-supplied multi-file template-pack layer, mirroring the
`configs/templates/workflows/*.yaml` precedent. Today every decision point's
system prompt is either a hard-linked constant or a single replace-only
`systemPrompts.<purpose>` override — there is no second-template slot, no
tag/context-based selection, and no searchability.

## Why

The aux pipeline serves a set of zero-shot classification decision points
(transition detection, intent, memory extraction, nsfw, moderation, gm-tool,
injection-check, carriage authoring, prompt-analysis, …), each with its own
system prompt + JSON output contract. Prompt sources are split across two
tiers:

1. **Hard-linked constants** in `src/aux-pipeline/prompts.ts`
   (`TRANSITION_CLASSIFIER_PROMPT`, `INJECTION_CHECK_PROMPT`,
   `CARRIAGE_AUTHORING_PROMPT`, `PROMPT_ANALYSIS_PROMPT` via
   `src/prompt-improve/prompts.ts`, …). Some call sites bypass the registry
   entirely: `src/validation/prompt-injection.ts` uses
   `INJECTION_CHECK_PROMPT` directly at its `callAux("injection-check")`
   site, `src/chat/service/carriage-authoring.ts` uses
   `CARRIAGE_AUTHORING_PROMPT`, `src/prompt-improve/service.ts` uses
   `PROMPT_ANALYSIS_PROMPT`.
2. **Registry + config overlay**: `src/prompts/registry.ts`
   (`LLM_PROMPT_DEFAULTS`, `resolveSystemPrompt(templates, purpose)`)
   resolves `configs/templates/llm.yaml` → `systemPrompts.<purpose>` →
   code default → `""`. One string per purpose, replace-only — a user who
   wants a parallel/alternative template for the same decision point has no
   slot, and the merge strategies (`src/config/templates-loader/merge.ts`)
   only apply per single purpose key.

Coupling hazard: `src/aux-pipeline/task-detect.ts` detects WHICH task a call
is by substring-matching the *default* prompt text (`TASK_MARKERS`); its
header states config-level overrides fall through to null. Any user-supplied
template breaks mock/e2e detection unless the task id is threaded explicitly
past the provider boundary.

`epic-config-templates.md` (Done) shipped the single-prompt overlay;
`epic-aux-enrichment-pipeline.md` hosts the 2026-10-03 classification
application-surface review that motivates user-tunable classifiers. Neither
specifies a template registry or user-supplied classification template packs.

## Phased design

### Phase 1 — Typed classification-task registry (formalize what exists)

- New `src/aux-pipeline/template-registry.ts` exporting a declarative
  `ClassificationTaskDef` (task, purpose, labels, preferClassifier, call
  overrides) and an `AUX_CLASSIFICATION_TASKS` record keyed by
  `AuxTaskName`. Fold the runner's `CLASSIFIER_TASKS` set into a
  `preferClassifier` field (single source).
- Add the missing prompt purposes to `PROMPT_PURPOSES`
  (`src/prompts/purposes.ts` — currently ends at aux classifiers
  `gmTool`/`moderation`; `injectionCheck`, `carriage`, `promptAnalysis`,
  `chatTitle`, `ragAsk` are absent) and register their defaults in
  `LLM_PROMPT_DEFAULTS`.
- Migrate the remaining hard-linked call sites
  (`prompt-injection.ts`, `carriage-authoring.ts`,
  `prompt-improve/service.ts`, chat-title, rag) to
  `resolveSystemPrompt`.
- Thread an explicit `taskId` through `AuxCallOptions` so
  `task-detect.ts` substring sniffing becomes a fallback, not the
  contract.

### Phase 2 — User-supplied template packs

- New multi-file domain `configs/templates/classifiers/*.yaml`, mirroring
  the `configs/templates/workflows/*.yaml` precedent (all matching files
  returned, user files layer over defaults by id; per-file
  `merge: extend|replace|override`). Note `TEMPLATE_FILES`
  (`src/config/templates-loader/discovery.ts`) covers only the
  single-file domains `llm|sd|avatar|image-edit|character` — the
  classifiers domain must add its own discovery path, like workflows did.
- Pack entry shape: `id`, `name`, `description`, `serves` (decision points
  answered), `tags`, optional structured `when` guards, `priority`,
  `params`, `labels`, `template`.
- Discovery/loading/validation per templates-loader conventions:
  hand-rolled validators that throw (matching
  `templates-loader/validation.ts`), Levenshtein typo warnings, a
  schema-class JSON-schema entry, wired at config load. NOT
  TypeBox/Zod/Elysia `t` (HTTP bodies only).
- `ClassTemplateIndex` + `selectClassTemplate(query)` selection with
  precedence: **pack template > `systemPrompts.<purpose>` single override
  > code default > classifier module degradation**. The single-prompt
  override stays for back-compat.

## Open questions

1. Same-task competition: first-match-by-priority vs merge of multiple
   matching templates?
2. Tag authority: **decided (owner, 2026-10-23): layered** — admin
   vocabulary + per-chat active subset + read-only actor-trait automatic
   layer; details in `FEAT-classifier-template-packs-user-config.md`.
3. Should `serves` allow future non-Aux decision points (regex stage2,
   workflow routing intents) or stay `AuxTaskName`-typed?
4. `task-detect.ts` marker coupling: thread explicit task id (proposed) or
   keep sniffing with documented breakage?
5. Do generation-shaped tasks (chat-title, rag-ask, prompt-analysis)
   belong in the same pack namespace or a separate `prompts/` pack dir?

## Related

- `epic-aux-enrichment-pipeline.md` — owns the aux runner + 2026-10-03
  classifier surface review; this epic adds the template layer above it.
- `epic-config-templates.md` — Done; shipped the loader/merge/registry
  this epic extends with a multi-file classifiers domain.
