<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: ComfyUI First-Class Citizen — Workflow Library, Chat Selection, Admin Setup

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Surface preparation, plus a follow-up investigation (`docs/meta/research/comfyui-first-class-investigation.md`) that **amended three design decisions**: the workflow library reuses `prompt_templates` rather than a new `comfy_workflows` table, the graph is stored inline in `payload` rather than on disk (no generated-config writer exists, and the loader's dir-mtime cache is not overwrite-safe), and two cited paths did not exist. Six defects are now confirmed by runnable probe against the operator's `i-anima-0001.json` — three original, three found by the investigation. Phases 0–1 are unblocked by that reference; the rest await the remaining operator workflows.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** comfyui, image-generation, workflows, admin, chat, lora
**ComfyUI Status:** First-class citizen (declared; this epic makes the declaration true at the workflow-library and UX seams)

## Overview

`epic-comfyui-plugin` made ComfyUI a first-class *backend* — HTTP client,
workflow loader, `{{var}}` substitutor, node discovery, LoRA discovery, and a TS
template registry all exist. What does **not** exist is first-class treatment of
ComfyUI *workflows as operator-supplied artifacts*:

1. **No workflow library.** Workflows are JSON files hardcoded in
   `configs/workflows/`. An operator cannot upload, name, categorize, enable, or
   version one. The admin panel has no ComfyUI surface at all.
2. **No chat-level selection.** `image-gen-route.ts` accepts a `workflow?: string`
   body param, but nothing persists a *preferred* workflow per user or per chat,
   and nothing surfaces the choice in the UI.
3. **No sane defaults.** `pickSdProvider()` picks a single provider by `purpose`.
   No default workflow, no default LoRA stack, no model-family routing. A fresh
   install with ComfyUI reachable still needs hand-wiring.
4. **The substitution + injection path does not survive real workflows.** Proven
   against the operator's own Anima reference workflow — see *Confirmed Defects*.

The ComfyUI REST contract does not change: `POST /prompt`, `GET /history/{id}`,
`POST /interrupt`, `GET /object_info`, `GET /view`, `GET /upload`, `/ws`. New
usecases stay workflow JSON, never custom API calls — the in-place decision from
`epic-comfyui-plugin` holds.

## Current State (verified against code)

| Area                    | File                                        | State  | Note                                                     |
| ----------------------- | ------------------------------------------- | ------ | -------------------------------------------------------- |
| ComfyUI HTTP client     | `src/generation/providers/comfyui.ts`       | Built  | submit/poll/download/upload/`getNodeInfo`. **No `client_id`, no `/ws`.** |
| Workflow loader         | `src/generation/workflow-loader/loader.ts`  | Built  | Scans `configs/workflows/*.json` by dir-mtime. Filename = name. No metadata, no DB. |
| Substitutor             | `src/generation/workflow-substitutor.ts`    | **Bug** | Coerces every `{{var}}` to string. Defect 1.           |
| LoRA injection          | `src/generation/lora/discovery-comfyui.ts`  | **Bug** | Assumes integer node ids. Defect 2. Single-LoRA only.  |
| Workflow validation     | `loader.ts` `isValidWorkflow`              | **Gap** | Rejects on empty + no `class_type`; tolerates dead nodes. Defect 3. |
| Image-gen route         | `src/generation/image-gen-route.ts`         | Built  | `workflow` body param. No persisted preference.         |
| Generation options      | `src/generation/image-engine/types.ts`      | **Bug** | No `width`/`height` in `ImageGenOptions`; providers read `sdConfig.defaults`. Defect 6. |
| Param validation        | `src/image-edit/routes.ts` `handleRun`      | **Gap** | Only `required` is checked. `min`/`max`/`step`/`options` unenforced. Defect 5. |
| Param form rendering    | —                                           | **None** | `TemplateParamType` declares 7 types; nothing renders them. |
| Image-edit templates    | `src/image-edit/templates/builtin/`         | Built  | 5 TS templates. `registerConfigWorkflows` ignores `params`. `buildLoraNodes` hardcodes node ids from 100. Defect 4. |
| Image-edit routes       | `src/image-edit/routes.ts`                  | Built  | `authorizeRunLinkage` closes the IDOR.                  |
| Provider selection      | `src/config/schema/sd-provider.ts`          | Thin  | `pickSdProvider()` by `purpose`. No family routing.     |
| Admin ComfyUI panel     | —                                           | **None** | No routes, no view, no Alpine component.             |
| Admin config store      | `src/routes/admin/system-config.ts`         | Built  | `system_config` KV. `comfyui_url` / `comfyui_enabled` exist but are **write-only** — nothing reads them at generation time. |
| Multipart upload        | `src/assets/controller.ts` `handleUpload`   | Built  | `POST /api/assets`, registered on the parent app to dodge Elysia body consumption. Reusable pattern. |

## Confirmed Defects (runnable probe, not inferred)

Probed against the operator-supplied reference workflow
`configs/workflows/uploads/i-anima-0001.json` (Anima txt2img, 10 nodes, colon-separated node
ids `46`, `60:8`, `60:11`, …).

### Defect 1 — `substituteWorkflow` destroys numeric types

`substituteString` returns `String(vars[key])` for every placeholder
(`src/generation/workflow-substitutor.ts:70-85`). Probe on the two shipped
workflows:

```
width:  "512"  string      seed:  "42"  string
height: "768"  string      steps: "20"  string
```

ComfyUI's `/prompt` validator type-checks each input against the node schema;
`KSampler.seed` and `EmptyLatentImage.width` are `INT`. A string is rejected.
`configs/workflows/txt2img.json` and `img2img.json` are therefore broken for every
numeric input. The existing tests only assert `buildSubstitutionVars` *returns*
numbers — they never assert the *substituted workflow* preserves them, which is
why this is green today.

**Fix:** a whole-string placeholder returns the typed value
(`"{{width}}"` → `512`); interpolation (`"a {{width}} b"`) stays string. Unknown
placeholders keep the current empty-string behavior — preserving graph structure
matters more than loud failure, and upstream param validation catches genuinely
missing inputs.

### Defect 2 — LoRA injection assumes integer node ids

`injectComfyUILora` derives the new node id via
`Math.max(...Object.keys(nodes).map(Number)) + 1`
(`src/generation/lora/discovery-comfyui.ts:218-224`). ComfyUI node ids are
**arbitrary strings** and the Anima reference uses colon-grouped ids (`60:45`).
`Number("60:45")` is `NaN`, so:

```
node ids:  ["46","60:45","60:15","60:8",…]
Math.max:  NaN
injected:  "NaN"
```

The injected `LoraLoader` gets the literal node id `"NaN"`. Fix: derive a fresh
id by scanning existing keys for the first free `N`, and never `Number()` a key —
node ids are opaque strings.

### Defect 3 — dead nodes are silently tolerated

Probe on the reference workflow found 2 of 10 nodes unreferenced as a link
source: `46` (`SaveImage` — a legitimate terminal sink) and `60:45`
(`CLIPLoader` — genuinely dead, superseded by `60:61` `CLIPLoaderGGUF`).

So unreferenced is *not* a defect signal on its own — terminals are normal. Any
upload validation must distinguish a terminal sink from a dead node: a node is
dead only if unreferenced **and** not a known sink class (`SaveImage`,
`PreviewImage`, …).

**Operator decision (2026-09-27): dead nodes are rejected, not warned.** Upload
validation errors on any dead node. Consequence to be aware of: the operator's
own `i-anima-0001.json` reference **fails this rule as-is** — its dead `60:45`
`CLIPLoader` (superseded by `60:61` `CLIPLoaderGGUF`) must be removed before it can
be uploaded. The fixture is committed unmodified as the *reference*; the cleaned
variant is what lands as a library row. This is a deliberate trade: strict
ingest keeps broken graphs out of the library, at the cost of rejecting real
operator exports until they are cleaned.

### Defect 4 — `buildLoraNodes` silently clobbers existing nodes (found 2026-09-27)

Same root cause as Defect 2 — inventing node ids by arithmetic — but a **different and
worse** failure mode: silent, not a visible `NaN`.

`src/image-edit/templates/builtin/lora.ts:40-69` starts at a hardcoded
`nodeIndex = 100` with the comment `// Start LORA nodes at 100 to avoid
collisions`, increments per LoRA, and is **not** given the set of existing ids, so
it cannot know what is taken. Probe against a graph already owning `100`/`101`:

```
parsed:        [{style.safetensors, 0.7}, {detail.safetensors, 0.4}]
generated ids: ["100","101"]
ASSERT no collision: FAIL — clobbers ["100","101"]
```

The graph still submits; a real node is simply gone. Graphs exceed 100 nodes
routinely (the Anima reference is 10; sprite-sheet and ControlNet graphs are far
larger), so the heuristic holds for small fixtures and breaks for real ones — the
worst possible failure profile.

**Fix:** one shared `allocateNodeId(existing)` helper used by both this and the
Defect 2 injector, so a third call site cannot regress independently. Tracked in
`TASK-comfyui-node-id-allocation`.

### Defect 5 — declared parameter ranges are never enforced (found 2026-09-27)

`TemplateParameter` (`src/image-edit/types.ts:59-70`) declares `min`, `max`,
`step`, `required`, `options`. `handleRun`
(`src/image-edit/routes.ts:97-106`) checks **only** `required`:

```ts
if (p.required && !body.params[p.name]) { missing.push(p.name); }
```

`txt2img` declares `width: { min: 64, max: 2048, step: 64 }` and accepts
`width: 999999` or `width: 13`, which flow straight into the ComfyUI graph. This is
a **trust boundary**, not cosmetics. The primitives already exist (`clamp` at
`src/utils/clamp.ts:30`, `clampUnit` at `:56`; `t.Number({ minimum, maximum })`
at `src/generation/lora/routes/validate.ts:13`). Tracked in
`TASK-comfyui-template-parameter-validation`.

**Second bug in the same three lines:** `!body.params[p.name]` is a falsy test, so
a legitimately-supplied `0` or `false` is reported as a *missing* required
parameter. `steps: 0`, `cfg_scale: 0`, and `enableHr: false` are all valid inputs
that the route rejects. Falsy is not absent — the check needs
`=== undefined` / `=== null`. Found under adversarial review 2026-09-27; it is
narrower than the range gap but on the same line, so it rides in the same ticket.

### Defect 6 — no width/height in the generation options type (found 2026-09-27)

`ImageGenOptions` (`src/generation/image-engine/types.ts:6-25`) has **no `width`
or `height` field at all**, so `generateComfyUI`
(`src/generation/image-engine/comfyui.ts:29-38`) cannot honour a request-supplied
size even in principle — it reads `sdConfig.defaults.width/height`, ignoring the
request. Same in `sdapi.ts:20-28` and `sdcpp.ts:44-58`.

**Consequence: every WxH/aspect-ratio template is currently unimplementable at the
route layer**, independent of anything on the ComfyUI side. This blocks Phase 2
regardless of how the workflow library turns out.

### Reference workflow shape (what operators actually produce)

| Property            | Value in `i-anima-0001.json`                                   |
| ------------------- | -------------------------------------------------------------- |
| Node id form        | Colon-grouped strings (`60:8`), not integers                   |
| Model loading       | `UNETLoader` + `CLIPLoaderGGUF` + `VAELoader` — **not** `CheckpointLoaderSimple` |
| CLIP variants       | Two loaders coexist (`CLIPLoader`, `CLIPLoaderGGUF`); one dead |
| Model paths         | Subpath-qualified (`anima/v1029B.safetensors`)                  |
| Sampler             | `er_sde` / scheduler `simple` / cfg `4` / steps `30`            |
| Output prefix       | `comfyui/anima/anima-0001-<timestamp>` — a natural `{{filename_prefix}}` slot |
| Node count          | 10 (7 reachable, 1 sink, 1 dead, 1 duplicated role)           |

Two consequences: model-family detection cannot infer from
`CheckpointLoaderSimple.checkpoint_name` (this workflow has no such node), and
`required_nodes` validation must accept a workflow whose declared nodes are a
*subset* of installed, not an exact match.

## Design

### Workflow library (reusing `prompt_templates`)

> **Amended 2026-09-27** after investigation
> (`docs/meta/research/comfyui-first-class-investigation.md` §0.1–0.2). The
> original design proposed a new `comfy_workflows` table with a `body_path`
> column. Both parts were re-checked against the code and **rejected**. The
> reasoning is preserved below so the decision is not re-litigated from memory.
>
> **Second correction, same day, under adversarial review of the first.** The
> first amendment also claimed the payload variant "slots into that union with no
> schema change" and that an `is_default` concept already existed. Both were
> **wrong**. See the table below and *Cost of adding a modality*.

`prompt_templates` (`src/db/schema-manifest.ts:2209-2220`) is exactly
`id, owner_id, modality, name, description, model_family, detail_level, payload,
created_at, updated_at`. `modality` is a **plain `text` column with a default**
(`col("text", { notNull: true, hasDefault: true })`) — there is no DB-level enum
constraint, so SQLite needs no table rebuild to accept a new value.

| original proposal | existing column |
| --- | --- |
| `id`, `name`, `description` | same |
| `family` | `model_family` (present, unused for image) |
| `category` | `modality` (`llm`/`image`/`video`/`audio`) |
| `params` | `payload` (JSON, dispatched on `modality`) |
| `owner_id` | `owner_id` (per-user templates already supported) |
| `is_default` | **absent.** No `is_default` column exists. |

**Correcting a false claim.** An earlier draft cited
`PUT /api/admin/templates/:id/defaults` (`src/routes/admin-templates/profiles.ts:36-59`)
as evidence a default concept exists. That is wrong twice over: the route is in
`update.ts:79-124`, and it updates **model generation defaults** (`cfgScale`,
`steps`, `sampler`, `scheduler`, `clipSkip`) inside a `system_config` KV blob
(`shared.ts:21-39`, `defaultProfileId`). It has nothing to do with marking a
template row as default. The epic's `resolveWorkflow` step *"default row for
(familyHint, category)"* therefore has **no storage at all** and `is_default` is a
genuinely new column.

Genuinely new columns: `is_default`, `enabled`, `lora_slots`, `min_vram`.

**Cost of adding a modality — larger than first stated.** A `workflow` value is a
TS-level enum change, not a DB one, but it is duplicated in **9 places**:

- 3 enum definitions: `src/db/enums-generation.ts:78-85` (`TemplateModality`),
  `src/validation/db-schemas.ts:516` (**generated** — `bun run db:sync-*`),
  `src/validation/schemas/templates.ts:15-20` (hand-written TypeBox literals, a
  *separate* definition from the generated one)
- 6 hardcoded `MODALITIES` arrays: `src/generation/template-service/crud.ts:15`,
  `src/routes/templates/crud.ts:39`, `src/routes/templates/transfer.ts:25`
- `src/test-utils/insert-helpers.ts` (generated; types the column)

**Two silent fallthroughs must be closed or the new modality misbehaves quietly:**

1. `parseTemplatePayload` (`src/generation/template-types.ts:83-103`) branches on
   `llm`, then `image`, then **falls through to `SimpleTemplatePayload` on anything
   else** (line 101). A `workflow` payload with no `body: string` returns `null`
   → rejected at create by the shape probe at `template-service/crud.ts:49`; a
   *typo’d* modality string silently shape-checks as `Simple`. Needs an explicit
   `workflow` branch plus an explicit `default: return null`.
2. `src/routes/templates/apply.ts:91-94` does `if (modality === "image") … else
   applySimpleTemplate(...)`. A `workflow` row would have its **graph rendered as
   a string template**. Needs an explicit branch or a 400.

`src/generation/image-gen-route.ts:87` is already safe — it guards
`row.modality !== "image"` with a 400.

**The graph is stored inline in `payload`, not as a file on disk.** The original
design put the body at `configs/workflows/uploads/<id>.json` for diff-friendliness.
That needs a mechanism loop-lore does not have: **nothing writes a config file
that a subprocess consumes.** `startLlamaSwap`
(`src/services/server-external-manager/start-llama.ts:167-180`) spawns with
`--config <hand-written path>` and only reads it. The system-config export endpoint
(`src/routes/admin/system-config.ts:64`) serializes *to a download*; there is no
write path.

It also breaks the loader cache. `WorkflowLoader` invalidates by **directory
mtime** (`src/generation/workflow-loader/loader.ts:114`), so overwriting a file
inside an already-scanned directory is invisible until an explicit `reload()`.

Inline storage removes the generated-config writer, the path, the sync, and the
stale-cache story in one decision. Cost: large JSON rows in the DB — acceptable at
this size (the Anima reference is 3.4 KB). Revisit only if graphs exceed ~100 KB,
at which point the operator wants them in git and a separate table is justified.

**What the KV store is still good for.** `system_config` is flat string key/value,
so it stays for the flat `comfyui_url` / `comfyui_enabled` keys. The original
rejection of the KV store for the *library* stands — the library needs
list-by-family and one-default-per-(family, category), which a flat KV blob cannot
express. That reasoning is unchanged; only the table choice changed.

### Selection resolution

A pure function, most-specific-first:

```
resolveWorkflow(bodyWorkflow?, chatPref?, userPref?, familyHint?) →
  bodyWorkflow                                  // explicit, wins
  ?? chatPref
  ?? userPref
  ?? default row for (familyHint, category)
  ?? single enabled row for that family
  ?? null
```

`chatPref` / `userPref` are new nullable columns on `chats` and `users`,
following the existing preference-column pattern (e.g.
`nsfw_user_preferences`). Pure and unit-testable; three row reads, no more.

### Numeric substitution

Per Defect 1: whole-string placeholder → typed value; interpolation → string.

### LoRA stacks

`injectComfyUILora` injects one `LoraLoader` and never rewires the consumer, so a
second LoRA orphans the first. Stacks become a declared ordered slot list on the
workflow; the injector chains slot *n*'s MODEL/CLIP output into slot *n+1*'s
input and terminates at the workflow's declared output anchor. Declared rather
than inferred — ComfyUI graphs vary too much to guess, and the Anima reference
already shows loaders duplicated and dead. Per Defect 2, node ids are opaque
strings throughout.

## Phases

### Phase 0: Correctness (blocks everything)

- [ ] Fix Defect 1 — numeric type preservation through `substituteWorkflow`.
- [ ] Regression test asserting the *substituted workflow* keeps `number`/
      `boolean` for `width`/`height`/`seed`/`steps`/`cfg_scale`. Existing tests
      only check the vars map, which is why the bug shipped.
- [x] Fix Defect 2 — opaque-string node ids in the LoRA injector; regression
      test using colon-grouped ids. *(Done with Defect 4 — same helper.)*
- [x] Fix Defect 4 — shared `allocateNodeId` helper covering **both** Defect 2 and
      Defect 4 in one place; regression test using a graph that already owns
      `100`/`101`. One helper, both call sites, no third regression.
      *(Shipped in `TASK-comfyui-node-id-allocation`. A second trap surfaced
      during the fix: `txt2img.build` allocates LoRA ids before the sampler node
      exists, so a naive max+1 was handed the sampler's id and the merge
      clobbered the `KSampler`. The template now derives its full id space up
      front. The regression test asserts the invariant, not a literal id.)*
- [ ] Fix Defect 3 — terminal-sink-aware dead-node detection in upload
      validation (warning, not error).
- [ ] Fix stale `/api/image-edit/*` doc comments → `/api/v1/*`.

### Phase 1: Workflow library (DB + admin upload)

- [ ] Migration `021_` adding `is_default` / `enabled` / `lora_slots` / `min_vram`
      to `prompt_templates` (append-only; latest is `020_`). `modality` is a plain
      `text` column, so the column itself needs no change.
- [ ] Add `workflow` to the `TemplateModality` enum in **all 9 places** listed in
      *Design* — 3 enum definitions (one is generated: run `bun run db:sync-*`) and
      6 hardcoded `MODALITIES` arrays. A miss compiles clean and silently 400s or
      renders the wrong shape.
- [ ] Add an explicit `workflow` branch to `parseTemplatePayload` and an explicit
      `default: return null`, so an unknown modality cannot fall through to
      `SimpleTemplatePayload`.
- [ ] Add an explicit branch (or 400) in `src/routes/templates/apply.ts:91-94` so a
      `workflow` row is never passed to `applySimpleTemplate`.
- [ ] Seed `workflow`-modality rows from `configs/workflows/*.json` on first boot;
      the existing two become rows and their filenames stay ids.
- [ ] Ingest validation: parse; per-node `class_type` + `inputs` shape; declared
      params must exist as placeholders; declared LoRA slots must resolve to real
      nodes; `required_nodes` must be a *subset* of installed (not exact match —
      the Anima reference installs more than it uses). Reject malformed uploads:
      a bad workflow stored now fails confusingly at 3am in a generation queue.
- [ ] Admin routes: list / create / update / delete / upload / set-default,
      mirroring `src/routes/admin-templates/`. Note the prompt-template module
      is at `/api/admin/templates` and SD templates are at `/api/admin/sd-templates`
      (split deliberately, `src/routes/admin/sd-templates.ts:19-21`); a ComfyUI
      surface must pick a third non-colliding prefix.
- [ ] Admin view + Alpine component; register in `admin.ts` `showTab`.
- [ ] Reuse the `handleUpload` multipart pattern (`POST /api/assets` +
      parent-app registration) — Elysia body consumption is a known trap here.
- [ ] `GET /api/v1/image-edit/templates` reads the registry, not the TS builtin
      list, so uploaded workflows are discoverable.
- [ ] Land `i-anima-0001.json` as the first uploaded workflow + reference fixture.

### Phase 2: Parameterized config workflows

- [ ] **Defect 6 first:** add `width`/`height` to `ImageGenOptions` and honour
      `opts` over `sdConfig.defaults` in `generateComfyUI` / `generateSDAPI` /
      `generateSDCPP`. Nothing in this phase works without it.
- [ ] **Defect 5:** enforce the already-declared `TemplateParameter` ranges
      server-side. Trust boundary — reuse `clamp` / `clampUnit`, do not invent.
- [ ] `registerConfigWorkflows` ignores `params` and returns static `nodes`.
      Route config-declared workflows through `substituteWorkflow` with declared
      params so `{{var}}` actually substitutes.
- [ ] Declared `params` become `TemplateParameter[]` (reuse
      `src/image-edit/types.ts`) so one workflow drives both the UI form and
      server-side validation.

### Phase 3: Chat + user preference

- [ ] Migration for preference columns (`chats`, `users`).
- [ ] Pure `resolveWorkflow` resolver + unit tests over the specificity order.
- [ ] Chat settings UI: pick preferred workflow, grouped by family/category.
- [ ] Parameter form renderer. `TemplateParamType` already declares seven types
      and **nothing renders them** — this is the largest unbudgeted UI cost in this
      epic and was folded implicitly into the admin work.
      (`TASK-comfyui-parameter-form-renderer`)
- [ ] `image-gen-route` consumes the resolver; explicit `workflow` still wins.
- [ ] Per-family defaults so a chat can prefer "anima txt2img" and a VN scene
      can hint `family` without hardcoding a workflow id.

### Phase 4: LoRA stacks

- [ ] Workflow-declared ordered slots; chain MODEL+CLIP slot-to-slot, terminate at
      the declared output anchor. Opaque node ids per Defect 2.
- [ ] Coeff 0.3-0.7 default per epic test notes; per-slot override from params.
- [ ] Admin: per-slot enable + default coeff, so operator-supplied LoRA-stack
      workflows are usable without hand-editing JSON.

### Phase 5: Defaults + operational readiness

- [ ] First-run config example covering the operator's workflow set.
- [ ] Output/input directory config for the managed spawner — no `output_dir`
      concept exists in the config schema today and no ticket owned it. Launch
      ComfyUI with `--output-directory` so the operator's `filename_prefix`
      composes correctly. (`TASK-comfyui-output-directory-config`)
- [ ] Sampler + scheduler enums discovered from `/object_info` at runtime, cached
      like LoRA discovery. **Two independent axes** — InvokeAI's single conflated
      `SCHEDULER_NAME_VALUES` is not a ComfyUI sampler list and would silently drop
      the scheduler axis. (`TASK-comfyui-sampler-scheduler-discovery`)
- [ ] `min_vram` declared per workflow, advised in the admin panel. Full VRAM
      budgeting out of scope; a declaration check catches the common case.
- [ ] Capability surfacing: which declared workflows are runnable given installed
      nodes (`/object_info`) and installed LoRAs. A workflow missing
      `required_nodes` must be visibly disabled, not silently failing at run time.
- [ ] Un-defer `client_id` + `/ws` progress (carried from `epic-comfyui-plugin`
      Phase 0) — required for a queue with real concurrency.

## Operator Workflow Request

**Agreed delivery (2026-09-27):** the operator drops each workflow into
`configs/workflows/uploads/` in the worktree, pre-marked with `{{placeholder}}`
names. Ingest then validates that every declared param exists as a placeholder in
the body. Verified that the loader's `extname === ".json"` filter skips the
uploads subdirectory, so fixtures there do not enter the runtime workflow set.

Delivered so far: **`i-anima-0001.json`** (Anima txt2img) — accepted as the
reference fixture, committed unmodified. Remaining, in the same API format
(`nodeId → { inputs, class_type, _meta }`, *not* the editor format with `links`
/ `pos` / `widgets_values`):

| # | Workflow                              | Family | Category       | Note                                                      |
| - | ------------------------------------- | ------ | -------------- | --------------------------------------------------------- |
| 1 | anima — image generation with LoRAs   | anima  | txt2img        | Anima's LoRA mechanism may differ from `LoraLoader`.       |
| 2 | sdxl/illustrious/noob/pony — generation | sdxl  | txt2img        | Base; no LoRA nodes.                                       |
| 3 | sdxl/illustrious/noob/pony — with LoRA stack | sdxl | txt2img    | Shows the LoRA chain shape so slots can be declared.       |
| 4 | krea2 — generation                    | krea2 | txt2img        | Krea 2 base graph.                                         |
| 5 | krea2 — generation with LoRAs         | krea2 | txt2img        | Krea 2 LoRA mechanism.                                     |
| 6 | krea2 — image edit / identity edit    | krea2 | identity-edit  | Dual-image identity reference. Epic notes "Not working in ComfyUI" as of 2026-07-28 — supply anyway; Phase 1 needs it to validate the identity-edit category. |

Per workflow also supply: the intended `{{placeholder}}` names, and the LoRA node
`class_type` + how the stack chains.

Delivery: drop into `configs/workflows/uploads/` in this worktree, or attach to a
git issue. Workflow JSON is inert — no secrets.

## Dependencies

- Existing: `src/generation/providers/comfyui.ts` (client)
- Existing: `src/generation/workflow-loader/` + `workflow-substitutor`
- Existing: `src/image-edit/` (template registry, provider, routes)
- Existing: `src/routes/admin-templates/` (admin CRUD pattern to mirror — the
  path cited in earlier drafts of this epic, `src/routes/admin/templates/`, does
  not exist)
- Existing: `src/assets/controller.ts` `handleUpload` (multipart pattern)
- New: operator-supplied workflow JSONs (Anima txt2img delivered; rest listed above)
- New: ComfyUI server with the target models/nodes

## Testing Strategy

| Test        | Coverage                                                 | Files                                       |
| ----------- | -------------------------------------------------------- | ------------------------------------------- |
| Unit        | Numeric type preservation through substitution           | `src/generation/workflow-substitutor.test.ts` |
| Unit        | Opaque/colon node ids in LoRA injection                   | `src/generation/lora/discovery-comfyui.test.ts` |
| Unit        | `allocateNodeId` collision-free on opaque ids (Defects 2+4) | `src/generation/node-id.test.ts`           |
| Unit        | Declared `min`/`max`/`step`/`options` enforced (Defect 5) | `src/image-edit/param-validation.test.ts`   |
| Unit        | `opts.width`/`height` beat config defaults (Defect 6)     | `src/generation/image-engine/comfyui.test.ts` |
| Unit        | Sampler and scheduler read as two distinct enums          | `src/generation/lora/discovery.test.ts`      |
| Unit        | Terminal-sink-aware dead-node detection                   | `src/generation/workflow-library.test.ts`  |
| Unit        | `resolveWorkflow` specificity order                       | `src/generation/resolve-workflow.test.ts`  |
| Unit        | Upload validation rejects malformed / node-less workflows | `src/generation/workflow-library.test.ts`  |
| Unit        | LoRA slot chaining produces a connected chain             | `src/generation/lora/stack.test.ts`        |
| Integration | Submit → poll → download → persist asset (fake ComfyUI)   | `tests/integration/comfyui.test.ts`         |
| E2E         | Upload workflow → set chat default → generate             | `tests/e2e/flows/comfyui.test.ts`           |

## Files (proposed)

- `src/db/migrations/021_*.ts` — `prompt_templates` additions + preference columns
- `src/generation/workflow-library/` — CRUD + validation (no disk sync; see Design)
- `src/generation/resolve-workflow.ts` — pure selection resolver
- `src/generation/lora/stack.ts` — slot chaining
- `src/generation/workflow-substitutor.ts` — Defect 1 fix
- `src/generation/lora/discovery-comfyui.ts` — Defect 2 fix
- `src/routes/admin/comfy-workflows/` — admin routes
- `src/views/admin-comfy-workflows.html` + `src/frontend/alpine/admin-comfy-workflows.ts`
- `configs/workflows/uploads/` — operator-supplied workflow bodies (ingest source;
  stored inline in `payload` after import)

## Open Questions

1. LoRA stack: authored as explicit nodes in the operator's JSON, or declared as
   metadata and injected? Default to **declared slots + injection** — the
   operator's workflows may already contain LoraLoader nodes, and injection is
   less error-prone.
2. Model-family detection: declare on the workflow row, or infer from loaders?
   The Anima reference uses `UNETLoader`/`CLIPLoaderGGUF`, not
   `CheckpointLoaderSimple`, so inference is unreliable. Default to declaration.
3. Admin: expose raw workflow JSON editing, or upload-only? Default upload-only +
   metadata editing — validation gates it, and raw editing invites silent breakage.
4. Per-user (BYO) workflows or server-wide only? Default server-wide; multi-tenant
   sharing is a larger design.

## Linked Tasks

- TASK-comfyui-first-class-workflow-library.md
- TASK-comfyui-first-class-chat-selection.md
- TASK-comfyui-first-class-admin-workflows.md
- TASK-comfyui-first-class-lora-stacks.md
- TASK-comfyui-workflow-parameterization.md
- TASK-comfyui-node-id-allocation.md
- TASK-comfyui-template-parameter-validation.md
- TASK-comfyui-sampler-scheduler-discovery.md
- TASK-comfyui-output-directory-config.md
- TASK-comfyui-parameter-form-renderer.md

## Related Epics

- `epic-comfyui-plugin` — the client/loader/template foundation this builds on
- `epic-lora-discovery-application` — LoRA discovery (done); stacks are the gap
- `epic-assistant-generation-extensions` — assistant-side image commands
- `epic-generation-flow-control` — queue that will host ComfyUI concurrency
- `docs/meta/research/comfyui-first-class-investigation.md` — the 2026-09-27
  investigation behind Defects 4-6 and the amended table/storage decisions


git issue: 6e95cc2
