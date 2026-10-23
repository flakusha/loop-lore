<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: aux classification template registry

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-classifier-template-packs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Formalize the aux-pipeline classification prompt surface as one typed
registry. Phase 1 of `epic-classifier-template-packs.md`: a declarative
`AUX_CLASSIFICATION_TASKS` record (`src/aux-pipeline/template-registry.ts`)
keyed by `AuxTaskName`, plus migration of the remaining hard-linked prompt
call sites to the `resolveSystemPrompt` registry, plus explicit taskId
threading to decouple `task-detect.ts` marker sniffing.

**Context:**

Prompt sources today are split across two tiers: hard-linked constants in
`src/aux-pipeline/prompts.ts` used directly at call sites
(`src/validation/prompt-injection.ts` `INJECTION_CHECK_PROMPT`,
`src/chat/service/carriage-authoring.ts` `CARRIAGE_AUTHORING_PROMPT`,
`src/prompt-improve/service.ts` `PROMPT_ANALYSIS_PROMPT`, chat-title and
rag inline literals), and the registry overlay
(`src/prompts/registry.ts` `LLM_PROMPT_DEFAULTS` /
`resolveSystemPrompt`) that other tasks (transition, intent, memory,
nsfw, moderation, gm-tool) resolve through. Several purposes are missing
from `PROMPT_PURPOSES` (`src/prompts/purposes.ts`): `injectionCheck`,
`carriage`, `promptAnalysis`, `chatTitle`, `ragAsk` — they must be added
with defaults registered in `LLM_PROMPT_DEFAULTS`. The runner's
`CLASSIFIER_TASKS` set folds into a per-task `preferClassifier` field.

Open questions for the owner (do not resolve unilaterally):
- Should the registry admit future non-Aux decision points (regex
  stage2, workflow routing intents) or stay `AuxTaskName`-typed?
- Do generation-shaped tasks (chat-title, rag-ask, prompt-analysis) belong
  in the same registry/pack namespace or a separate `prompts/` pack dir?
- `message-action` has no production caller — dead slot (gm-tool
  wire-or-remove precedent): drop or record?

**Caveats:**

- **Behavioral drift in mock/e2e detection**: threading `taskId` through
  `AuxCallOptions` makes `task-detect.ts` substring sniffing a fallback;
  any call site left un-threaded still sniffs and breaks the moment its
  default prompt moves into `LLM_PROMPT_DEFAULTS` if text changes. Audit
  every `callAux` site in the same change; keep marker texts stable or
  thread the id everywhere.
- **Prompt-text equivalence**: migrating call sites to
  `resolveSystemPrompt` must preserve byte-identical default prompts, or
  the prompt-eval fixtures (`src/aux-pipeline/eval/`) and
  `TASK_MARKERS` silently stop matching. Golden fixtures are the safety
  net — update them only when a prompt change is intentional.
- **Partial migration = two sources of truth**: leaving any hard-linked
  call site un-migrated re-creates the drift this ticket removes. Acceptance
  is grep-clean: no decision point builds its system prompt from a constant
  import.
- **Rollback**: pure refactor; rollback is revert of the single commit.
  No config or schema change ships in phase 1.

**Acceptance Criteria:**

- [ ] `AUX_CLASSIFICATION_TASKS` exists with a descriptor per decision
      point; `CLASSIFIER_TASKS` in the runner is folded into
      `preferClassifier` (single source)
- [ ] `injectionCheck`, `carriage`, `promptAnalysis`, `chatTitle`,
      `ragAsk` purposes added to `PROMPT_PURPOSES` +
      `LLM_PROMPT_DEFAULTS`; the 5 hard-linked call sites resolve via
      `resolveSystemPrompt`
- [ ] `AuxCallOptions` carries an explicit task id; `task-detect.ts`
      sniffing is fallback-only and documented as such
- [ ] Prompt-eval fixtures pass unchanged (or are updated only for
      intentional prompt diffs); no hard-linked prompt import remains at
      any decision-point call site
