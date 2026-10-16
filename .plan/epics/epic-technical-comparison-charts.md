<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Technical Comparison Charts (multi-image model/generation comparison)

**Overview:** (see ## Summary below)

**Status:** Not Started
**Status Note:** Not Started (verified 2026-10-16: no comparison-set table, no image comparison route, and no comparison view exist. The existing comparison code is all LLM-*text*: `src/routes/model-comparisons.ts` on `model_comparison_runs` / `model_comparisons`, plus `src/routes/generation/compare.ts`, `src/routes/comparisons-export.ts` and `src/routes/model-comparisons-analytics.ts` (see ## Current State). The gallery grid at `src/views/gallery.html` / `src/routes/views/gallery.ts` renders a flat asset list with no cross-variant structure.)
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** image-generation, comparison, comfyui, sd-cpp, gallery, charts, metadata, reproducibility, frontend

## Summary

A first-class **technical comparison chart** surface: one prompt (or one reference image) driven
through N *variants* — different image models (Krea 2 / Krea 3 / Qwen Image Edit 2.1 / Minimax H3 /
FLUX Kontext / sd.cpp), different checkpoints/LoRA stacks, different parameter sweeps, or different
neural-network architectures and image generations generally — rendered as an image matrix, a
parameter table, and a metric chart.

This is a **technical instrument**, not a social product. What it guarantees is parameter fidelity,
seed pinning, full metadata round-trip, per-cell diffing, and reproducibility. What it explicitly
does not build is voting, leaderboards, or a feed (see ## Non-Goals).

## Overview

Three capabilities, layered:

1. **Comparison set** — a persisted entity holding one prompt/reference plus N variants, each fully
   parameterized and re-runnable.
2. **Fan-out execution** — dispatch those N variants concurrently across ComfyUI and sd.cpp with
   per-variant status and partial-failure isolation.
3. **Chart surface** — an htmx + Alpine grid (models as columns, prompts as rows), a per-cell detail
   readout with the full generation metadata, two-cell technical diff modes, sweep series, scalar
   metric charts, and PNG/SVG/CSV export.

Existing generation dispatch (`src/generation/image-engine/index.ts` `generateImages`) and asset
persistence (`src/assets/service/persist-generated.ts` → `createAsset`, `content_hash` dedup) are
reused unchanged; this epic adds the set, the fan-out, and the presentation layer on top.

## Scope

### Comparison set (the persisted entity)

A comparison set is **one prompt or one reference + N variants**. A variant is the complete
generation contract:

| Field | Meaning |
| --- | --- |
| `backend` | `comfyui` / `sdcpp` (the `apiFamily` values `generateImages` dispatches on) |
| `model` / `checkpoint` | Model id, checkpoint filename, or ComfyUI workflow JSON |
| `lora_stack` | Ordered list of `{ name, weight, trigger }` |
| `seed` | Pinned integer; `null` means "unpinned" and is itself a comparability warning |
| `sampler` / `scheduler` | Sampler name + scheduler name |
| `steps`, `cfg` | Denoise parameters |
| `width` / `height` | Resolution; drives comparability |
| `reference_set` | Ordered asset ids of reference images (img2img / edit / Kontext inputs) |
| `edit_mask` | Optional mask asset id for inpaint variants |

**Reproducibility contract:** same set + same seed + same parameters ⇒ re-runnable. A re-run creates a
new *run* record pointing at the same variants; it never mutates a landed run's metadata.

### Fan-out execution

- N variants dispatched **concurrently**, each through `generateImages` with its own
  `ImageProviderConfig` resolved by `pickSdProvider(providers, purpose)` at
  `src/config/schema/sd-provider.ts:19`.
- Per-variant status: `queued` / `running` / `done` / `failed`, plus provider progress when reported
  (`ComfyUIExecutionStatus.progress` at `src/generation/providers/comfyui.ts:38`).
- **Partial-failure isolation:** one backend down must not sink the set. A failed variant records its
  error; the set still reaches a terminal state with the surviving cells usable.
- Successful outputs persist through `persistGeneratedImages` so `content_hash` dedup and asset
  linking behave exactly as they do for `/api/generation` today
  (`src/generation/image-gen-route.ts:168`).

### Comparison chart surface

- **Image matrix** — models as columns, prompts (or reference rows) as rows. Sortable, filterable,
  multi-select cells.
- **Parameter table** — one row per variant, columns = the variant fields above; cells that differ
  across a comparison highlight.
- **Seed/param lock** — lock a variant's parameters so a re-run or a sibling variant inherits them.
- **Cell detail** — click a cell → full generation metadata + `extra_pnginfo` round-trip when
  ComfyUI supplied it (today it is not read anywhere in `src/`; the ComfyUI client returns
  `ComfyUIOutputFile[]` with only `filename` / `subfolder` / `type` at
  `src/generation/providers/comfyui.ts:44`), plus the asset id and provenance link back to the set.
- **Provenance** — every cell resolves to an asset id + the variant id + the run id that produced it.

### Technical comparison affordances

- **Two-cell diff modes** — difference (absolute/overlay), side-by-side, flicker (A/B at a chosen
  fps). All three are canvas work over two `/api/assets/:id/raw` byte streams; no new backend.
- **Per-variant metadata readout** — EXIF/PNG-text via the existing `extractImageMetadata`
  (`src/assets/metadata.ts:236`), plus generation params stored on the variant row.
- **Sweep series** — seed, steps, and CFG as a first-class variant axis (see the sweep ticket); the
  set stores the axis, and the chart renders one series per axis value.
- **Metric charts** — a line chart of a scalar metric vs a parameter. Metrics in v1: latency (ms) and
  cost, both measured. `vram_peak_mb` is recorded only if a backend actually reports it — no VRAM read
  exists in `src/generation/providers/` or `src/generation/image-engine/`, and this epic does not add a
  probe; the metric stays absent rather than estimated. A CLIP/aesthetic score is likewise absent until
  an *image* scorer is configured (`src/story/quality/registry.ts:13` registers text-only scorers).
- **Chart export** — PNG / SVG / CSV. SVG export is a **client-side download only** and is never
  persisted as an asset: `src/assets/service/validate.ts:28` blocks `image/svg+xml` at persist time and
  the vector-gen sanitizer (`src/assets/service/sanitize-svg.ts`) does not exist yet. See the export
  ticket for the gate that must land before any SVG is ever served from an app URL.

### Comparability rules

Two cells are legitimately comparable when all of the following hold:

- identical `width` / `height` (aspect mismatch is a hard warning),
- identical seed **policy** (both pinned to the same integer, or both explicitly unpinned),
- identical `reference_set` (same reference asset ids, same order),
- identical sampler/scheduler family when the comparison axis is the model.

When a rule is violated the chart renders an explicit non-comparable badge on the cell *and* on any
pair/diff/aggregate computed from it. Non-comparable cells are still viewable and still diffable —
they are just excluded from aggregates and charts unless the user overrides.

## Design

### Fan-out decision: a dedicated engine module, NOT a new workflow step type

**Decision: fan-out is a loop inside a new `src/comparisons/fan-out.ts` engine module, invoked by a
comparison route — not a new `WorkflowStepConfig.type`.**

Justification, against the real code:

- `WorkflowStepConfig.type` is a closed union `"text" | "choice" | "multi"`
  (`src/config/sections/templates-workflow.ts:26`) and every step is *prompt construction*: it
  validates a value, contributes a `formatTemplate` fragment, and is folded into one prompt by
  `assemblePrompt` (`src/assistant/workflow-runner.ts:101`). A step is synchronous and pure; the whole
  runner module is synchronous and pure.
- Fan-out is the opposite: N async provider calls, per-variant status rows, retries, and partial
  failure. Putting it in the runner would mean either making the runner async (breaking
  `previewSteps` / `buildStep` / `assemblePrompt` / `confirmAndDispatch` for every existing workflow)
  or adding a step type that does not fit the prompt-construction shape.
- `dispatch.target` already carries an HTTP endpoint or pipeline target
  (`WorkflowDispatchConfig.target`, `src/config/sections/templates-workflow.ts:48`). A comparison
  template therefore dispatches to `POST /api/comparison-sets`, and that route runs the fan-out engine.
  The template keeps declaring prompt/reference/variant-axis as ordinary steps; no schema surgery.

**Trade-off accepted:** the template cannot express "N variants" declaratively — it declares the
comparison *intent* and the axes; the concrete variant list is posted to the route. This is the same
split every other template already has (template assembles intent, route does IO).

### Partial-failure isolation

The engine never `Promise.all`s into a single result. Each variant gets its own promise that is
awaited into a settled result (`{ status: "done" | "failed", ... }`), so one rejection cannot
short-circuit the set. Set-level state is derived from variant states: any `queued`/`running` ⇒
`running`; all terminal with ≥1 `done` ⇒ `completed_with_errors`; all terminal with zero `done` ⇒
`failed`.

### Data model

New tables (append-only migration per `src/db/migrations/README.md`), regenerated with
`bun run db:sync-types && bun run db:sync-manifest`:

- `comparison_sets` — id, user_id, prompt, reference_set (json), title, created_at
- `comparison_set_variants` — id, set_id, position, the variant fields above, status, error,
  asset_id, provider_progress, started_at, completed_at
- `comparison_set_runs` — id, set_id, started_at, completed_at, status (reproducibility re-runs)
- `comparison_variant_metrics` — variant_id, metric key, value (latency_ms, vram_peak_mb, cost,
  clip_score)

Output assets are ordinary rows in `assets`, linked through the existing polymorphic `asset_links`
table by `linkAsset` (`src/assets/service/links.ts:23`). The `AssetLinkEntity` union
(`src/db/enums-content.ts:73`) today has only `chat`, `character`, `world`, `actor`, `location`,
`quest`, `item`, `memory`, `message`, `asset` — so this epic **adds a `comparison_set` entry** to that
enum and links each output under `entityType: "comparison_set"`. Until that entry exists the gallery's
own guard (`Object.values(AssetLinkEntity).includes(entityTypeParam)`, `src/routes/views/gallery.ts:162`)
rejects the filter, so the enum addition is a hard prerequisite for the gallery integration.

## Assistant integration

- A workflow template `configs/templates/workflows/comparison-models.yaml` declares the comparison
  intent (prompt step, reference step, variant-axis choice step, backend choice step) and dispatches
  to `POST /api/comparison-sets`.
- `/compare` slash command routes through `matchWorkflowTrigger`
  (`src/assistant/workflow-routing.ts:51`), the same entry every other template uses.
- Results are linked into the chat as ordinary assets, so a comparison run shows up in the chat and in
  the gallery with no special-casing.
- The gallery can open an existing set: gallery items carrying a `comparison_set` asset link expose an
  "open in comparison" affordance, and the gallery filter selects a set through the existing
  `entityType=comparison_set&entityId=<setId>` asset-link query — there is no `set_id` gallery
  search parameter.

## Non-Goals

- **No social feed, no public leaderboard, no voting or user scoreboards.** Reaction/blind-mode/A-B
  comparison of *LLM outputs* is `TASK-model-comparison-reactions.md`'s territory under
  `epic-testing-qa.md`; this epic does not touch it and does not read its tables.
- **No model training, fine-tuning, or benchmarking harness.** Comparison charts measure generations
  that already happened; they never launch a training run.
- **No video/audio comparison in v1** — the variant model is image-shaped, though it does not
  hard-block a media extension later.
- **No new image backend.** Fan-out reuses the existing `openai` / `sdapi` / `sdcpp` / `comfyui`
  dispatch in `src/generation/image-engine/index.ts`.

## Tasks

- [ ] Comparison set + variant data model and migration — `TASK-comparison-set-variant-data-model.md`
- [ ] Comparison set routes: CRUD, ownership, validation — `TASK-comparison-set-routes-crud-ownership-validation.md`
- [ ] Fan-out execution engine across ComfyUI + sd.cpp, per-variant status, partial-failure isolation — `TASK-comparison-fan-out-engine.md`
- [ ] Reproducibility: seed/parameter lock + exact re-run of a set — `TASK-comparison-seed-parameter-lock-and-rerun.md`
- [ ] Comparison grid frontend (htmx partial + Alpine state), models-as-columns / prompts-as-rows, filter/sort/select — `TASK-comparison-grid-frontend.md`
- [ ] Cell detail view: full generation metadata, `extra_pnginfo` import, provenance/asset links — `TASK-comparison-cell-detail-metadata.md`
- [ ] Two-cell technical diff: difference / side-by-side / flicker — `TASK-comparison-two-cell-diff-modes.md`
- [ ] Parameter sweep series (seed / steps / CFG) as a first-class variant axis — `TASK-comparison-parameter-sweep-axis.md`
- [ ] Comparability rules as one shared predicate consumed by grid, diff, chart, and sweep — `TASK-comparison-comparability-validation.md`
- [ ] Metric collection (latency, VRAM peak, cost) + metric chart line/series rendering — `TASK-comparison-metric-collection-and-charts.md`
- [ ] Chart export PNG/SVG/CSV with the SVG sanitization gate honored — `TASK-comparison-chart-export-png-svg-csv.md`
- [ ] Comparison workflow template (YAML) + `/compare` assistant command + chat asset linking — `TASK-comparison-workflow-template-and-command.md`
- [ ] Gallery ↔ comparison-set integration (open a set from the gallery, filter the gallery by set) — `TASK-comparison-gallery-comparison-set-integration.md`
- [ ] Cross-cutting tests: set lifecycle, fan-out partial failure, comparability — `TASK-comparison-tests-set-lifecycle-fan-out-comparability.md`

## Dependencies

| Dependency | Kind | Note |
| --- | --- | --- |
| `src/generation/image-engine/index.ts` | reuse | `generateImages` fan-out target; no change required |
| `src/config/schema/sd-provider.ts` | reuse | `pickSdProvider(providers, purpose)` resolves the per-variant `ImageProviderConfig` |
| `src/assets/service/persist-generated.ts` | reuse | `persistGeneratedImages` → `createAsset`; `content_hash` dedup inherited |
| `src/assets/service/links.ts` | reuse | `linkAsset` attaches outputs to their variant |
| `src/assets/metadata.ts` | reuse | `extractImageMetadata` for the per-cell dimension/format readout |
| `src/assistant/workflow-routing.ts` | reuse | `/compare` trigger routing |
| `src/assistant/workflow-runner.ts` | reuse, unmodified | Prompt-assembly only; fan-out deliberately stays out (see ## Design) |
| `src/config/sections/templates-workflow.ts` | reuse, unmodified | `WorkflowStepConfig.type` union is left alone (see ## Design) |
| `epic-comfyui-plugin.md` | upstream | ComfyUI workflow-JSON contract that variants reference |
| `epic-assistant-generation-extensions.md` | upstream | sd.cpp server backend + SD provider config surface |
| `epic-asset-platform-capabilities.md` | upstream | Asset substrate; `asset_renditions` ladder still in progress and is **not** assumed landed |
| `epic-frontend-gallery.md` | upstream | Gallery grid patterns reused by the comparison grid |
| `epic-creative-studio.md` | upstream | Unified search + toolbar + modal patterns reused by the filter bar and cell modal |
| `epic-vector-graphics-generation.md` | upstream | SVG export pipeline + sanitizer gate |
| `epic-testing-qa.md` | sibling | Owns `TASK-model-comparison-reactions.md` (LLM output reactions) — referenced, not merged |

## Related Epics

- `epic-comfyui-plugin.md` — ComfyUI workflow-JSON contract and node model
- `epic-assistant-generation-extensions.md` — sd.cpp backend, SD provider config, intent routing
- `epic-assistant-creative-studio-workflows.md` — workflow-template hub and `model-families.yaml`
- `epic-model-family-presets.md` — per-family parameter schemas and recommendation presets
- `epic-asset-platform-capabilities.md` — assets, `content_hash` dedup, rendition ladder
- `epic-frontend-gallery.md` — gallery grid, search, preview modal
- `epic-creative-studio.md` — search / unified modal / toolbar patterns
- `epic-vector-graphics-generation.md` — SVG pipeline and sanitization gate for chart export
- `epic-testing-qa.md` — declares `TASK-model-comparison-reactions.md` as one of its Linked Tasks (LLM
  output reactions); this epic deliberately does not duplicate it

## Current State

Verified 2026-10-16 on branch `dev` (this work landed on `dev`; the working branch
`assistant-book-comic-workflows` it was drafted on no longer exists):

- No comparison-set table, route, or view exists. `src/db/migrations/` HEAD is
  `056_xp_ledger_dedupe_unique.ts`. Two comparison-shaped tables exist and both are **LLM text**:
  `model_comparison_runs` (`src/db/migrations/015_model_comparison_runs.ts`) stores a prompt plus JSON
  `results` and `ratings` blobs, and `model_comparisons`
  (`src/db/migrations/001_init.ts:104`, typed at `src/db/schema-moderation.ts:13`) stores a per-message
  `reference_model` / `preference` / `confidence` vote. Neither is an image comparison set, and this
  epic extends neither.
- Four comparison route modules exist today, none of them image-shaped:
  - `src/routes/model-comparisons.ts` — `GET /api/comparisons` (list the user's runs) and
    `POST /api/comparisons/:id/rating`. The LLM-output preference tracker. Cited only as the
    route-module precedent.
  - `src/routes/generation/compare.ts` — `POST /api/v1/generation/compare` (FEAT-060). Runs the same
    prompt across N LLM models in parallel via `Promise.allSettled`, returning text, latency, tokens and
    a cost estimate. Ephemeral: it persists nothing.
  - `src/routes/comparisons-export.ts` — `GET /api/v1/comparisons/:id/export?format=json|markdown`.
    Renders a stored `model_comparisons` row as a downloadable JSON or markdown report.
  - `src/routes/model-comparisons-analytics.ts` — legacy preference-analytics routes kept separate from
    run-comparison storage.

  What this epic adds that none of them do: **persisted, image-shaped** comparison sets with re-runnable
  parameterized variants (`comparison_sets` / `comparison_set_variants` / `comparison_set_runs`), fan-out
  across ComfyUI + sd.cpp, per-cell provenance, comparability rules, and a chart/grid/export surface.
- Side-by-side concepts *do* exist in `.plan/`, but all of them are text/revision-shaped rather than
  image-variant-shaped:
  - `FEAT-060.md` — model comparison A/B for **LLM responses** (the ticket behind
    `src/routes/generation/compare.ts`); its storage note names a `model_comparisons` table with a
    `results` JSON blob, which is the already-shipped `model_comparisons` shape above.
  - `TASK-model-comparison-reactions.md` (`epic-testing-qa`) — reaction tracking, blind-mode A/B over
    LLM outputs; explicitly not images.
  - `TASK-asset-versioning.md` — version history and diff over a single asset; no prompt/model axis.
  - `TASK-admin-revisions-diff-revert.md` — admin diff-and-revert over row revisions; no image matrix.

  What remains distinct here is the axis: one prompt or reference driven across N image
  models/checkpoints/parameter sweeps, with per-variant reproducibility and a comparability predicate.
- `TASK-sd-e2e-real-server-fixtures-via-sd-cpp-and-comfyui-with-gene.md` is the first real
  multi-provider data source this epic can lean on for fixtures.
- `extra_pnginfo` is **not** read anywhere in `src/` today; the ComfyUI client returns only
  filename/subfolder/type per output file (`src/generation/providers/comfyui.ts:44`). The cell-detail
  ticket owns adding that read.
- `asset_renditions` does **not** exist as a table in `src/db/` today. The rendition ladder is
  referenced by `epic-asset-platform-capabilities.md` but is not yet in the schema — this epic does
  not depend on it.

## Acceptance Criteria

- [ ] A comparison set persists prompt/reference + N fully-parameterized variants and round-trips through the routes
- [ ] A set of N variants fans out concurrently across ComfyUI and sd.cpp; one backend failing leaves the surviving cells `done` and the set terminal
- [ ] Per-variant status (`queued`/`running`/`done`/`failed`) is observable while the set is in flight
- [ ] Re-running a set with the same seed and parameters reproduces the same variant parameters
- [ ] The grid renders models as columns and prompts as rows, with working filter, sort, and cell selection
- [ ] A cell detail view shows full generation metadata, `extra_pnginfo` when ComfyUI supplied it, and the asset/provenance links
- [ ] Difference, side-by-side, and flicker modes render for any two selected cells
- [ ] Seed, steps, and CFG sweeps are expressible as a first-class variant axis
- [ ] Latency and cost are recorded per variant and render as a line chart against a swept parameter; a metric the backend does not report (currently `vram_peak_mb`) stays absent rather than estimated, and the chart says so
- [ ] Chart export produces PNG, SVG, and CSV. SVG is a **client-side download only** — no exported SVG is persisted through `createAsset` or served from an app URL, matching `src/assets/service/validate.ts:28` blocking `image/svg+xml`. Serving SVG from an app URL is out of scope until `TASK-vector-gen-svg-serve-safety.md` lands
- [ ] Non-comparable cell pairs are badged and excluded from aggregates unless overridden
- [ ] `/compare` in chat creates a set whose outputs appear as ordinary linked assets
- [ ] The gallery can open an existing comparison set and filter by set
