<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Investigation: ComfyUI First-Class Citizen — surface gaps

**Date:** 2026-09-27
**Branch:** `comfyui-first-class-citizen`
**Related Epic:** `epic-comfyui-first-class-citizen`
**Purpose:** Follow-up investigation of four areas raised during surface
preparation: (1) llama-swap/standalone config + output folder, (2) generation
parameter surface, (3) creative-studio integration, (4) reference
implementations (InvokeAI).
**Method:** read-only code investigation + runnable probes. Every defect below
was reproduced by executing code, not inferred from reading it.

---

## 0. Findings that revise the epic

Four points where the investigation contradicts or materially extends
`epic-comfyui-first-class-citizen` as written. These are corrections, not
additions.

### 0.1 The proposed `comfy_workflows` table duplicates `prompt_templates`

> **Corrected 2026-09-27 under adversarial review.** The first version of this
> section claimed the payload variant "slots into that union with no schema
> change" and that an `is_default` concept already existed. Both were wrong.
> The correction is folded in here; see also the epic's *Cost of adding a
> modality*.

`prompt_templates` (`src/db/schema-manifest.ts:2209-2220`) is exactly
`id, owner_id, modality, name, description, model_family, detail_level, payload,
created_at, updated_at`.

| proposed `comfy_workflows` | existing `prompt_templates` |
| --- | --- |
| `id` | `id` (PK) |
| `name` / `description` | `name` / `description` |
| `family` | **`model_family`** (already there, unused for image) |
| `category` | `modality` — plain `text` column, `notNull` + `hasDefault`, **no DB enum constraint** |
| `params` | `payload` (JSON, modality-dispatched) |
| `owner_id` | `owner_id` (already supports per-user templates) |
| `enabled` / `is_default` | **both absent** |

`src/generation/template-types.ts:49` dispatches the `payload` JSON on `modality`
through the `TemplatePayload` union (`LlmTemplatePayload`, `ImageTemplatePayload`,
`SimpleTemplatePayload`).

**On "no schema change"** — technically true of the *column* (plain text, so
SQLite needs no table rebuild) but badly understates the work. The `modality`
value is a TS-level enum duplicated in **9 places**:

- `src/db/enums-generation.ts:78-85` — the `TemplateModality` const + type
- `src/validation/db-schemas.ts:516` — `t.UnionEnum([...])`, **generated**
- `src/validation/schemas/templates.ts:15-20` — hand-written TypeBox literals, a
  *separate* definition from the generated one
- 6 hardcoded `MODALITIES` arrays: `src/generation/template-service/crud.ts:15`,
  `src/routes/templates/crud.ts:39`, `src/routes/templates/transfer.ts:25`
- `src/test-utils/insert-helpers.ts` — generated, types the column

Missing one compiles clean and fails at runtime, which is the worst profile.

**Two silent fallthroughs** — the reason "just add a variant" is wrong here:

1. `parseTemplatePayload` (`src/generation/template-types.ts:83-103`) tests `llm`,
   then `image`, then **falls through to `SimpleTemplatePayload` for anything
   else** (line 101). A `workflow` payload without a `body: string` returns `null`
   → the create-time shape probe at `template-service/crud.ts:49` rejects it; a
   *typo’d* modality string silently validates as `Simple`. Needs an explicit
   `workflow` branch **and** an explicit `default: return null`.
2. `src/routes/templates/apply.ts:91-94` is `if (modality === "image") … else
   applySimpleTemplate(...)`. A `workflow` row has its **graph rendered as a string
   template**. Needs an explicit branch or a 400.

`src/generation/image-gen-route.ts:87` is already safe (guards
`row.modality !== "image"` with a 400).

**Consequence:** a new table is still the *bigger* change — but the delta is
narrower than "three new fields". Genuinely new columns: `is_default`,
`enabled`, `lora_slots`, `min_vram`; plus a `workflow` payload variant and the 9
enum edits. `body_path` is avoidable entirely (see 0.2).

### 0.2 The epic's "DB row + body on disk" split has no existing mechanism

`startLlamaSwap` (`src/services/server-external-manager/start-llama.ts:167-180`)
spawns with `--config <hand-written path>` and reads `startPort` from that file.
**loop-lore never writes a config file.** Verified: `system-config.ts` has no
`writeFile` anywhere; its `POST /import` handler (`:163-212`) calls
`importConfigFromText(db, content, format)`, which parses YAML/TOML *text into KV
rows* rather than producing a file. The `PATCH` handler (`:143-161`) calls
`setConfig` — again KV-only.

So the epic's `body_path` column implies a build: a generated-config writer, a
`reload()` on the `WorkflowLoader` singleton, and a mtime-invalidation story. The
loader caches by *directory* mtime. Verified at `loader.ts:106-118`:
`stat(dirPath)` → `currentMtime`, then `if (currentMtime <= this.dirMtime &&
this.cache.size > 0) return;`. Only adding/removing/renaming an entry changes a
directory's mtime, so **overwriting a file's contents in an already-scanned
directory is invisible until an explicit `reload()`**.

Storing the graph inline in `prompt_templates.payload` sidesteps the whole
problem: no file, no path, no sync, no stale cache. The cost is large JSON rows in
the DB — acceptable at this size (the Anima reference is 3.4 KB).

**Recommendation:** inline in `payload`. Revisit only if graphs grow past ~100 KB,
at which point the operator wants them in git anyway and a separate table is
justified.

### 0.3 No output-folder config exists, and no ticket owns it

There is no `output_dir` / `models_dir` concept in the loop-lore config schema.
`${models_dir}` in `configs/config.llama-swap.example.yaml:44` is a *llama-swap*
macro, not a loop-lore value. `ComfyUIAutoStartConfig` **does not exist yet** —
`src/config/schema/auto-start.ts:168-184` defines only `LlamaCpp`, `SdCpp`, and
`LlamaSwap` variants.

`TASK-comfyui-first-class-standalone-auto-start-config-lifecycle` (issue
`5bd5c7e`) owns the config schema and spawner but does **not** mention an output
folder. Genuinely unowned gap.

### 0.4 The epic cites two paths that do not exist

| cited in epic | actual |
| --- | --- |
| `src/routes/admin/templates/` | `src/routes/admin-templates/` (`index.ts`, `profiles.ts`, `editing.ts`, `list.ts`, `create.ts`, `update.ts`, `remove.ts`, `shared.ts`) |
| `src/generation/template-service.ts` | directory: `template-service/{crud,apply,resolve}.ts` |

Also: the admin prompt-template module is at `/api/admin/templates`, while SD
image templates are at `/api/admin/sd-templates` — deliberately split to avoid
collision (`src/routes/admin/sd-templates.ts:19-21`). A ComfyUI admin surface
must pick a third non-colliding prefix.

---

## 1. Config + output folder (investigation area 1)

### 1.1 Current state

- llama-swap: hand-written YAML, path from `LlamaSwapAutoStartConfig.configPath`
  (`src/config/schema/auto-start.ts:168-184`). Read at spawn, never written.
- `setConfig` (`src/admin/config.ts:81-96`) writes a **plain string** value — no
  structured/JSON storage. `importConfigFromText` (`:216-249`) round-trips
  YAML/TOML into the same KV table, so a JSON value would have to be
  double-encoded to survive the YAML round-trip.
- UUID convention: `uid()` at `src/utils.ts:39-40` wraps `crypto.randomUUID()`.
- Precedent for *UUID row + filesystem path*: `assets.storage_path`
  (`001_init.ts:412-414`) and `request_results.offload_path`
  (`001_init.ts:148-165`).

### 1.2 Where an output folder belongs

It is a **process-level path**, not a per-workflow or per-user one. That places it
with the other auto-start config, i.e. inside the not-yet-built
`ComfyUIAutoStartConfig` — the same schema the standalone ticket already owns.

Recommended shape:

```typescript
interface ComfyUIAutoStartConfig {
  enabled: boolean;
  baseUrl: string;
  binary: string;
  args: string[];
  readinessTimeoutMs: number;
  /** NEW — filesystem roots handed to the ComfyUI process. */
  outputDir: string;   // default: <repo>/.tmp/comfyui-output
  inputDir: string;    // default: <repo>/.tmp/comfyui-input
}
```

Naming: uuid-named *run* subdirectories (`outputDir/<runId>/`) rather than
uuid-named *workflow* files. This matches the ComfyUI model where one process
serves many workflows — a per-process output root with uuid run dirs survives a
restart and keeps runs separable, which a uuid-per-workflow dir does not.

Note the interaction with `filename_prefix`: the Anima reference hardcodes
`comfyui/anima/anima-0001-<timestamp>`. That is *relative to ComfyUI's own
`output_directory`*, not to loop-lore. The two must be reconciled — either the
process is launched with `--output-directory <outputDir>`, or loop-lore ignores the
prefix and matches returned filenames by `prompt_id` (which is what `pollResult`
already keys on). **Prefer the `--output-directory` flag** and keep the existing
prompt-id-based retrieval.

---

## 2. Generation parameter surface (investigation area 2)

### 2.1 The parameter gap is a type gap, not a plumbing gap

`ImageGenOptions` (`src/generation/image-engine/types.ts:6-25`) has **no `width`
or `height` field at all.** So `generateComfyUI`
(`src/generation/image-engine/comfyui.ts:29-38`) cannot honour a
request-supplied size even if it wanted to:

```ts
width: sdConfig.defaults.width,    // from config, not opts
height: sdConfig.defaults.height,  // from config, not opts
```

Same pattern in `sdapi.ts:20-28` and `sdcpp.ts:44-58`. `openai.ts:26-32` takes
only `prompt`/`size`/`n`/`outputFormat`/`negativePrompt` and silently drops the
rest.

Consequence: **every WxH template is currently unimplementable at the route
layer**, regardless of the workflow side. The `size?: string` field exists but is
openai-shaped (`"1024x1024"`) and is not plumbed into the ComfyUI path.

### 2.2 Declared but unenforced validation

`TemplateParameter` (`src/image-edit/types.ts:59-70`) declares `min`, `max`,
`step`, `required`, and `options`. **Nothing enforces them server-side.**
`handleRun` (`src/image-edit/routes.ts:97-106`) checks only `required`:

```ts
if (p.required && !body.params[p.name]) { missing.push(p.name); }
```

So `txt2img` declares `width: { min: 64, max: 2048, step: 64 }` and accepts
`width: 999999` or `width: 13`. The builtin `build()` functions pass params
straight into the workflow.

The primitives already exist and are used elsewhere:

- `src/utils/clamp.ts:30-34` — `clamp` (generic min/max binder, returns `NaN`
  unchanged so callers can distinguish)
- `src/utils/clamp.ts:56-58` — `clampUnit` ([0,1], NaN/Infinity→fallback), already
  used in `prompt-injection.ts`
- `t.Number({ minimum, maximum })` in Elysia bodies — the pattern used at
  `src/generation/lora/routes/validate.ts:13`

**This is a trust-boundary gap.** A client can post arbitrary `steps`/`width`
straight into a graph. A range validator driven by the already-declared
`TemplateParameter` metadata is the cheap fix: one pass over
`template.parameters` before `build()` is called.

### 2.3 Substitution vars are missing scheduler and denoise

`buildSubstitutionVars` (`src/generation/workflow-substitutor.ts:133-163`)
produces exactly: `prompt`, `negative_prompt`, `width`, `height`, `steps`,
`cfg_scale`, `sampler`, `seed`, plus a primitive passthrough of unknown extras.

`scheduler` and `denoise` are **not** in the list, yet the shipped
`configs/workflows/txt2img.json:40-41` contains them as hardcoded literals
(`"scheduler": "normal"`, `"denoise": 1`). The passthrough would supply them *if*
a caller passed them as flat `opts` — but `ImageGenOptions` has
`denoisingStrength` (under a different name) and no `scheduler` at all, and
`generateComfyUI` never passes either into the loader call.

`src/image-edit/templates/builtin/_helpers.ts:57-99` (`ksamplerNode`) emits a
`scheduler` input but hardcodes it rather than threading it from params — same
class of bug, already present in a built template.

### 2.4 Fourth defect: LoRA node ids collide with the host graph

`buildLoraNodes` (`src/image-edit/templates/builtin/lora.ts:40-69`) starts at a
**hardcoded** `nodeIndex = 100` and increments. It is handed a start model/clip
ref but **not the set of existing ids**, so it cannot know what is taken.

Probe against a graph that already owns `100` and `101`:

```
parsed:        [{style.safetensors, 0.7}, {detail.safetensors, 0.4}]
generated ids: ["100","101"]
ASSERT no collision: FAIL — clobbers ["100","101"]
```

Real operator graphs reach 100+ nodes routinely (the Anima reference is 10, but a
sprite-sheet or ControlNet graph is far larger). This is a **silent** failure: the
injected LoRA node overwrites an existing node and the graph still submits.

This is the third instance of the same root cause as the epic's Defect 2 — code
inventing node ids by arithmetic. **One fix, one place:** a shared
`allocateNodeId(existingKeys)` helper used by both `injectComfyUILora` and
`buildLoraNodes`.

### 2.5 LoRA weight semantics: loop-lore is already ahead of InvokeAI

`LoraEntry` (`src/image-edit/types.ts:41-48`) has `path`, `strength`, and
`isHighNoise`. `buildLoraNodes` maps `strength` to **both** `strength_model` and
`strength_clip` (ComfyUI's two knobs). InvokeAI's `LoRAField`
(`invokeai/app/invocations/model.py:85-87`) has a **single** `weight` float, range
`-10..10` (`recall_parameters.py:19-24`).

loop-lore's model is the correct one for a ComfyUI backend. Do not port
InvokeAI's. Its range is a diffusers artifact, not a ComfyUI constraint.

One genuine divergence: InvokeAI stacks LoRAs as a **typed list** on the model
field; loop-lore parses a **string** `"path:strength,path:strength"`
(`parseLoraString`, `lora.ts:11-30`). The string form is a UI convenience and
should be parsed once at the boundary into `LoraEntry[]` — which is exactly what
the epic's declared `lora_slots` does. Keep the string only in the
URL/query layer.

---

## 3. Creative studio integration (investigation area 3)

### 3.1 What exists today

- Trigger: `generateImageFromMessage(msgId)`
  (`src/frontend/alpine/chat-actions/media.ts:13-51`) — POSTs
  `/api/v1/generation/image` with `{chatId, messageId, prompt}`. Bound from three
  places in `src/components/chat/message-list.html` (364, 522, 600).
- Route: `handleImageGeneration` (`src/generation/image-gen-route.ts:53-200`) —
  auth → `checkChatAccess` → optional `templateId` resolution →
  `applyImageTemplate` → provider pick → `generateImages` → `createAsset` +
  `linkAsset` (message + chat).
- Result surfaces via SSE `stream-done` → `loadMessages()` refresh
  (`src/frontend/alpine/chat-generations.ts:42-60`).
- Admin prompt templates: full CRUD at `/api/admin/templates` with an Alpine
  list → select → inline-edit → save flow
  (`src/frontend/alpine/admin-templates/{profiles,editing}.ts`).

### 3.2 The two systems are different in kind

| | prompt template | ComfyUI workflow |
| --- | --- | --- |
| artifact | one prompt string + `{{vars}}` | full JSON graph (10+ nodes) |
| lives in | `prompt_templates.payload.templateBody` | nowhere yet |
| admin UI | exists, working | does not exist |
| execution | `applyImageTemplate` → string → provider | `build(params)` → graph → ComfyUI |

They share a *shape* (name, description, `{{vars}}`, admin CRUD, ownership) but
not a *kind*. A ComfyUI workflow is not a prompt template with a bigger body.

**They should share the table, not the payload type.** `prompt_templates` gains a
`workflow` modality; `ImageTemplatePayload` and a new `ComfyWorkflowPayload` are
siblings in the `TemplatePayload` union. Reuse the ownership model, the admin
CRUD routes, the list endpoint, and the Alpine list/select/edit pattern. Do not
try to make `applyImageTemplate` render a graph.

### 3.3 Minimal UI delta

1. **Chat settings**: a workflow `<select>` grouped by family, sourced from
   `GET /api/v1/image-edit/templates?backend=comfyui`. This is the
   chat-selection ticket; the endpoint already exists and already returns
   lightweight summaries excluding `build` (`routes.ts:125-143`).
2. **Parameter form**: rendered from the selected workflow's `parameters[]`.
   `TemplateParamType` (`src/image-edit/types.ts:30-36`) already declares
   `string|number|boolean|select|image|lora` — but there is **no renderer** for
   them anywhere. This is net-new frontend work, and it is the single largest UI
   cost in the epic.
3. **Admin tab**: clone the existing `admin-templates` list/select/edit pattern.

Worth stating plainly: step 2 is real work, and nothing in the current codebase
builds a form from a parameter schema. Budget it as its own ticket rather than
folding it into the admin work.

---

## 4. Reference implementations (investigation area 4)

Primary reference: `/home/flak/git-ai/invoke-ai/` (read-only).

### 4.1 Sampler vs scheduler — InvokeAI conflates them, do not copy

This is the most important negative finding.

ComfyUI's `KSampler` takes **two independent axes**: `sampler_name` and
`scheduler`. The Anima reference uses `sampler_name: "er_sde"` and
`scheduler: "simple"`.

InvokeAI has **one** enum called `SCHEDULER_NAME_VALUES`
(`invokeai/backend/stable_diffusion/schedulers/schedulers.py:28-60`, 27 values)
whose members are ComfyUI *sampler* names — it has no `scheduler` axis at all.
Its `_k` suffix (`euler_k`, `dpmpp_2m_k`) is InvokeAI's way of encoding
karras-noise-schedule, which ComfyUI expresses as a separate `scheduler` input.

So InvokeAI's enum is **not** a drop-in for loop-lore's sampler list, and using it
as one would silently drop the scheduler axis. Two enums are required:

```typescript
// ComfyUI KSampler.sampler_name
const SAMPLER_NAMES = [
  "euler", "euler_ancestral", "heun", "dpmpp_2m", "dpmpp_2m_sde",
  "dpmpp_3m_sde", "dpmpp_sde", "dpmpp_2s_ancestral", "lms", "ddim",
  "uni_pc", "er_sde", "plms",
] as const;
// ComfyUI KSampler.scheduler
const SCHEDULER_NAMES = [
  "normal", "simple", "karras", "exponential", "sgm_uniform", "ddim_eta", "beta",
] as const;
```

The authoritative source is the **installed ComfyUI instance**, not either repo.
`GET /object_info` already returns `KSampler.input.required.sampler_name[0]` and
`.scheduler[0]` as the installed enum lists — so the enum should be **discovered
at runtime from `/object_info`** and cached, exactly as LoRA discovery already
does (`src/generation/lora/discovery.ts`, 5-minute cache). Hardcoding a list will
drift from whatever the operator has installed.

InvokeAI's per-family split is still useful as a *hint*: Anima supports 6
(`invokeai/backend/flux/schedulers.py:98` — `euler, heun, dpmpp_2m,
dpmpp_2m_sde, er_sde, lcm`) versus 3 for Flux. Runtime discovery supersedes it, but
it confirms Anima genuinely narrows the valid set.

### 4.2 Node ids are opaque — independently corroborated

InvokeAI's graph (`invokeai/app/services/shared/graph.py:88-110`) keys nodes by
**string** `node_id` with `Edge = {source: {node_id, field}, dest: {...}}`. It
never does arithmetic on ids. Same conclusion as the epic's Defect 2, reached
independently. Good sign the fix is correct.

### 4.3 WxH rules worth adopting

- `LATENT_SCALE_FACTOR = 8` (`invokeai/app/invocations/constants.py:3`); width and
  height are `multiple_of=8`.
- `invokeai/app/invocations/ideal_size.py:39-74` — `trim_to_multiple_of` with base
  dimensions 512 (SD1.5) / 768 (SD2) / 1024 (SDXL, Flux, Anima).

loop-lore's `txt2img` template declares `min: 64, max: 2048, step: 64` — a step of
64 is *stricter* than ComfyUI requires and would reject valid 8-aligned sizes like
1000. WxH presets should snap to **8**, with family-specific base sizes
(512 / 768 / 1024).

### 4.4 VRAM gating — a real gap, deliberately out of scope

InvokeAI gates on free VRAM before load
(`invokeai/backend/model_manager/load/model_cache/model_cache.py:2112-2131`),
with per-model-type working-memory estimates
(`invokeai/backend/util/vae_working_memory.py`, covering sd15/sdxl, flux, flux2,
wan, **anima**, cogview4, qwen_image, sd3).

loop-lore has nothing. The epic's practical test notes already record that Qwen
Image Edit exceeds 20 GB real usage on a 20 GB card. Without a gate, a user picks
a workflow the machine cannot run and discovers it by OOM at run time.

Recommend a `GET /system_stats` VRAM read plus a per-workflow declared `min_vram`,
surfacing an advisory in the admin panel ("this workflow needs 24 GB; this host
has 20 GB"). Full budgeting like InvokeAI's is out of scope; a *declaration
check* is cheap and catches the common case.

### 4.5 Batch enqueue is worth stealing

`POST /v1/queue/{queue_id}/enqueue_batch`
(`invokeai/app/api/routers/session_queue.py:120-141`) takes a `Batch` of graphs
and returns per-item results. loop-lore's image queue ticket already scopes
concurrency to 1 per ComfyUI baseUrl; a batch endpoint on the *loop-lore* side
(`/api/v1/generation/image` with `prompts[]`) is the user-facing equivalent and
pairs with the gallery batch operations the creative-studio epic already plans.

### 4.6 Explicitly NOT ComfyUI

InvokeAI is a self-contained app with its own invocation system and graph
runtime. It is **not** a ComfyUI adapter and does not consume ComfyUI graphs. Its
scheduler enums are ComfyUI-*compatible by coincidence of both wrapping
diffusers. Use it for parameter-surface ideas and resolution/VRAM rules only.

---

## 5. Defect ledger (reproduced)

| # | Defect | Location | Severity |
| --- | --- | --- | --- |
| 1 | `{{var}}` stringifies every value; numerics rejected by `/prompt` | `workflow-substitutor.ts:70-85` | P0 (existing) |
| 2 | Node id via `Math.max(...ids.map(Number))` → `NaN` | `lora/discovery-comfyui.ts:218-224` | P0 (existing) |
| 3 | No terminal-sink-aware dead-node rule | `workflow-loader/loader.ts` | P0 (existing) |
| 4 | `buildLoraNodes` hardcodes ids from 100, no collision check, **cannot see** existing ids | `image-edit/templates/builtin/lora.ts:40-69` | **P0 (new)** |
| 5 | `TemplateParameter.min/max/step` declared but never enforced | `image-edit/types.ts:59-70`, `image-edit/routes.ts:97-106` | **P1 (new)** — trust boundary |
| 6 | `ImageGenOptions` has no width/height; `generateComfyUI` reads config defaults | `image-engine/types.ts:6-25`, `image-engine/comfyui.ts:32-33` | **P1 (new)** — blocks all WxH work |
| 7 | `scheduler`/`denoise` unreachable through `buildSubstitutionVars` | `workflow-substitutor.ts:144-153` | P1 (new) |
| 8 | JSDoc at `workflow-substitutor.ts:62` claims non-string returns; signature and body disagree | same | P2 (doc lies about intent) |

Defect 4 shares a root cause with Defect 2 — invent node ids by arithmetic. One
helper fixes both.

---

## 6. Recommendations

1. **Reuse `prompt_templates`; do not add `comfy_workflows`.** Add a `workflow`
   modality + `ComfyWorkflowPayload` variant. Cheaper, and inherits ownership,
   admin CRUD, and the Alpine surface.
2. **Store the graph inline in `payload`, not on disk.** No generated-config
   writer exists and the loader's mtime cache is not overwrite-safe.
3. **Add `width`/`height` to `ImageGenOptions`** before any WxH template work.
   This is the hard blocker, and it is a small type change plus plumbing.
4. **Enforce the already-declared `TemplateParameter` ranges** server-side. One
   validation pass; reuses existing `clamp` utilities. Trust boundary.
5. **Discover samplers and schedulers from `/object_info` at runtime**, cached like
   LoRA discovery. Do not hardcode; do not copy InvokeAI's single conflated enum.
6. **One `allocateNodeId` helper** for Defects 2 and 4 together.
7. **WxH presets snap to 8**, with family base sizes 512/768/1024. Widen the
   builtin `step: 64` which is stricter than ComfyUI requires.
8. **Output folder belongs in `ComfyUIAutoStartConfig`** (unowned today), using
   uuid *run* directories under a per-process root, and launch ComfyUI with
   `--output-directory` so the operator's `filename_prefix` composes correctly.
9. **Declare `min_vram` per workflow** and advise in admin. Full budgeting out of
   scope.
10. **Extract a parameter-form renderer as its own ticket** — no such renderer
    exists and it is the largest UI cost.

---

## 7. Related

- `epic-comfyui-first-class-citizen` — the epic these findings amend
- `epic-comfyui-plugin` — client/loader/template foundation
- `epic-assistant-creative-studio-workflows` — the un-deferred UI epic
- `docs/meta/research/image-editing-models.md` — practical model test results
