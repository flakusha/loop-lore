<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: ComfyUI First-Class Citizen — Workflow Library, Chat Selection, Admin Setup

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Surface preparation. Existing ComfyUI surface inventoried against real code; three defects confirmed by runnable probe against the operator-supplied `i-anima-0001.json` reference workflow (numeric coercion, colon node ids, dead-node tolerance). Phases 0–1 are unblocked by that reference; the rest await the remaining operator workflows.
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
| Image-edit templates    | `src/image-edit/templates/builtin/`         | Built  | 5 TS templates. `registerConfigWorkflows` ignores `params`. |
| Image-edit routes       | `src/image-edit/routes.ts`                  | Built  | `authorizeRunLinkage` closes the IDOR.                  |
| Provider selection      | `src/config/schema/sd-provider.ts`          | Thin  | `pickSdProvider()` by `purpose`. No family routing.     |
| Admin ComfyUI panel     | —                                           | **None** | No routes, no view, no Alpine component.             |
| Admin config store      | `src/routes/admin/system-config.ts`         | Built  | `system_config` KV. `comfyui_url` / `comfyui_enabled` exist but are **write-only** — nothing reads them at generation time. |
| Multipart upload        | `src/assets/controller.ts` `handleUpload`   | Built  | `POST /api/assets`, registered on the parent app to dodge Elysia body consumption. Reusable pattern. |

## Confirmed Defects (runnable probe, not inferred)

Probed against the operator-supplied reference workflow
`.tmp/comfyui/i-anima-0001.json` (Anima txt2img, 10 nodes, colon-separated node
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

### Workflow library (DB-backed, disk-seeded)

A new `comfy_workflows` table is the source of truth for *what workflows exist*
and *which are active*. The JSON body stays a file on disk — workflow JSON is
large, diff-friendly, and belongs in git, not a KV blob.

```
comfy_workflows
  id            TEXT PK      stable slug, e.g. "anima-txt2img"
  name          TEXT NOT NULL
  family        TEXT NOT NULL  model family: sdxl | anima | krea2 | ...
  category      TEXT NOT NULL  txt2img | img2img | identity-edit | ...
  backend       TEXT NOT NULL  "comfyui"
  description   TEXT
  body_path     TEXT NOT NULL  path under configs/workflows/uploads/
  params        TEXT NOT NULL  JSON: declared TemplateParameter[]
  lora_slots    TEXT NOT NULL  JSON: ordered LoRA slot descriptors
  enabled       INTEGER        0/1
  is_default    INTEGER        0/1, at most one per (family, category)
  created_at / updated_at
```

Seeded on first boot from `configs/workflows/*.json` (existing two become rows;
filenames stay ids so nothing else moves). Admin upload writes the body to
`configs/workflows/uploads/<id>.json` and upserts the row — disk and DB stay in
lockstep and the file stays reviewable in a PR.

**Why not the KV store.** `system_config` is flat string key/value: no indexing,
no uniqueness, no list query. A library needs list-by-family,
one-default-per-(family,category), and enable/disable. Forcing that into one JSON blob
means read-modify-write races and no partial updates. `getAllConfig/setConfig`
stay for the flat `comfyui_url` / `comfyui_enabled` keys.

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
- [ ] Fix Defect 2 — opaque-string node ids in the LoRA injector; regression
      test using colon-grouped ids.
- [ ] Fix Defect 3 — terminal-sink-aware dead-node detection in upload
      validation (warning, not error).
- [ ] Fix stale `/api/image-edit/*` doc comments → `/api/v1/*`.

### Phase 1: Workflow library (DB + admin upload)

- [ ] Migration `021_comfy_workflows` (append-only; latest is `020_`).
- [ ] Seed from `configs/workflows/*.json` on first boot.
- [ ] Ingest validation: parse; per-node `class_type` + `inputs` shape; declared
      params must exist as placeholders; declared LoRA slots must resolve to real
      nodes; `required_nodes` must be a *subset* of installed (not exact match —
      the Anima reference installs more than it uses). Reject malformed uploads:
      a bad workflow stored now fails confusingly at 3am in a generation queue.
- [ ] Admin routes: list / create / update / delete / upload / set-default,
      mirroring `src/routes/admin/templates/`.
- [ ] Admin view + Alpine component; register in `admin.ts` `showTab`.
- [ ] Reuse the `handleUpload` multipart pattern (`POST /api/assets` +
      parent-app registration) — Elysia body consumption is a known trap here.
- [ ] `GET /api/v1/image-edit/templates` reads the registry, not the TS builtin
      list, so uploaded workflows are discoverable.
- [ ] Land `i-anima-0001.json` as the first uploaded workflow + reference fixture.

### Phase 2: Parameterized config workflows

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
- Existing: `src/routes/admin/templates/` (admin CRUD pattern to mirror)
- Existing: `src/assets/controller.ts` `handleUpload` (multipart pattern)
- New: operator-supplied workflow JSONs (Anima txt2img delivered; rest listed above)
- New: ComfyUI server with the target models/nodes

## Testing Strategy

| Test        | Coverage                                                 | Files                                       |
| ----------- | -------------------------------------------------------- | ------------------------------------------- |
| Unit        | Numeric type preservation through substitution           | `src/generation/workflow-substitutor.test.ts` |
| Unit        | Opaque/colon node ids in LoRA injection                   | `src/generation/lora/discovery-comfyui.test.ts` |
| Unit        | Terminal-sink-aware dead-node detection                   | `src/generation/workflow-library.test.ts`  |
| Unit        | `resolveWorkflow` specificity order                       | `src/generation/resolve-workflow.test.ts`  |
| Unit        | Upload validation rejects malformed / node-less workflows | `src/generation/workflow-library.test.ts`  |
| Unit        | LoRA slot chaining produces a connected chain             | `src/generation/lora/stack.test.ts`        |
| Integration | Submit → poll → download → persist asset (fake ComfyUI)   | `tests/integration/comfyui.test.ts`         |
| E2E         | Upload workflow → set chat default → generate             | `tests/e2e/flows/comfyui.test.ts`           |

## Files (proposed)

- `src/db/migrations/021_comfy_workflows.ts` — new table + preference columns
- `src/generation/workflow-library/` — CRUD + validation + disk sync
- `src/generation/resolve-workflow.ts` — pure selection resolver
- `src/generation/lora/stack.ts` — slot chaining
- `src/generation/workflow-substitutor.ts` — Defect 1 fix
- `src/generation/lora/discovery-comfyui.ts` — Defect 2 fix
- `src/routes/admin/comfy-workflows/` — admin routes
- `src/views/admin-comfy-workflows.html` + `src/frontend/alpine/admin-comfy-workflows.ts`
- `configs/workflows/uploads/` — operator-supplied workflow bodies

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

## Related Epics

- `epic-comfyui-plugin` — the client/loader/template foundation this builds on
- `epic-lora-discovery-application` — LoRA discovery (done); stacks are the gap
- `epic-assistant-generation-extensions` — assistant-side image commands
- `epic-generation-flow-control` — queue that will host ComfyUI concurrency


git issue: 6e95cc2
