<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison fan-out execution engine (ComfyUI + sd.cpp)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-variant-data-model.md`, `TASK-comparison-set-routes-crud-ownership-validation.md`, `TASK-comparison-seed-parameter-lock-and-rerun.md`, `TASK-sd-e2e-real-server-fixtures-via-sd-cpp-and-comfyui-with-gene.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Dispatch N variants concurrently across ComfyUI and sd.cpp, track per-variant status
(`queued`/`running`/`done`/`failed`) with provider progress, and isolate failures so one dead backend
never sinks the set.

## Context

**Design decision (locked in the epic's ## Design): fan-out is a loop in a new engine module, NOT a
new workflow step type.** `WorkflowStepConfig.type` is a closed union
`"text" | "choice" | "multi"` (`src/config/sections/templates-workflow.ts:26`) and every step is
synchronous prompt construction — `assemblePrompt` folds step values into one prompt
(`src/assistant/workflow-runner.ts:101`) and `confirmAndDispatch` returns a plain envelope
(`src/assistant/workflow-runner.ts:121-152`). Making the runner async to host N provider calls would
change every existing workflow. The engine therefore lives beside the generation layer and is invoked
by the comparison routes.

Reuse, unchanged:

- `generateImages(sdConfig, opts)` at `src/generation/image-engine/index.ts:27` — dispatches on
  `sdConfig.apiFamily` across `openai|sdapi|sdcpp|comfyui` and returns a discriminated
  `ImageGenOutcome` that never throws on provider failure.
- `pickSdProvider(providers, purpose)` at `src/config/schema/sd-provider.ts:19` — resolves the
  per-variant `ImageProviderConfig`; `purpose` is `"generate" | "edit"`.
- `persistGeneratedImages` (`src/assets/service/persist-generated.ts:59`) → `createAsset`
  (`src/assets/service/create.ts:37`), the same call `handleImageGeneration` makes at
  `src/generation/image-gen-route.ts:168`, so `content_hash` dedup and asset links behave identically.
- Provider progress shape: `ComfyUIExecutionStatus.progress` (`{ value, max }`) at
  `src/generation/providers/comfyui.ts:38`.

Partial-failure isolation: do not `Promise.all` into a single result. Settle each variant
independently (`Promise.allSettled` semantics or an explicit try/catch per variant) so one rejection
cannot short-circuit the set. Set status derives from variant statuses: any `queued`/`running` ⇒
`running`; all terminal with ≥1 `done` ⇒ `completed_with_errors`; all terminal with zero `done` ⇒
`failed`.

Concurrency must be bounded — a set of 30 variants must not open 30 simultaneous provider requests.
Cap in-flight dispatches per backend and queue the rest; the cap is a constant, not config, until
throughput actually demands otherwise.

`TASK-sd-e2e-real-server-fixtures-via-sd-cpp-and-comfyui-with-gene.md` is the first real
multi-provider fixture source for an integration test of the two-backend path.

## Acceptance Criteria

- [ ] `src/comparisons/fan-out.ts` exports a fan-out entry point taking the set's variants and dispatching them through `generateImages`
- [ ] Each variant row transitions `queued` → `running` → (`done` | `failed`) and the transition is readable via `GET /api/comparison-sets/:id` while the set is in flight
- [ ] With one backend forced to fail, every variant on the other backend still reaches `done`, the set reaches `completed_with_errors`, and the failed variants carry their error text
- [ ] With every backend failing, the set reaches `failed` and no variant is left in `queued`/`running`
- [ ] In-flight dispatch count per backend never exceeds the documented cap under a 30-variant set
- [ ] Successful outputs persist through `persistGeneratedImages`, so a byte-identical output from two variants collapses onto one `assets` row via `content_hash` and both variants point at it
- [ ] `src/comparisons/fan-out.test.ts` covers: all-success, one-backend-down, all-backends-down, and in-flight cap enforcement
