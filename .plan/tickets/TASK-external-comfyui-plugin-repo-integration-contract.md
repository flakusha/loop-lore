<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: External ComfyUI plugin repository — loop-lore consumption contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-comfyui-plugin`
**Related:** `epic-comfyui-first-class-citizen.md`, `epic-reference-conditioned-generation.md`, `epic-assistant-generation-extensions.md`, `epic-assistant-creative-studio-workflows.md`, `TASK-comfyui-node-discovery-template-autofilter.md`, `TASK-comfyui-ws-client-id-progress-reference-generation.md`, `TASK-minimax-h3-stills-reference-template.md`, `TASK-multi-reference-conditioning-request-model.md`, `TASK-illustrated-book-reference-pass.md`, `src/generation/providers/comfyui.ts`, `src/image-edit/template-registry.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The contract by which loop-lore consumes a **separate, externally maintained ComfyUI
plugin repository** without taking ownership of it. It fixes four things: the
allowlist of documented ComfyUI REST endpoints loop-lore may call, the refusal
list (never vendor/install/re-ship/maintain custom nodes, never call a plugin's
private HTTP contract, never encode a plugin's hardcoded literals in code), the
required-node declaration every workflow template carries so an undeployed plugin
fails *early*, and the read-only `/object_info` probe that detects a breaking
change upstream.

Nothing here is a new endpoint, a new DSL, or a new intent. It is a rule about
which existing seams are allowed to grow, plus the two wirings that make an
undeployed dependency legible instead of mysterious.

## Context

**Owner decision (2026-10-16, repo owner):** ComfyUI addons live in their **own
repositories**. loop-lore does not host, vendor, install, or maintain ComfyUI
custom nodes. Those repositories are integrated with loop-lore later, by the
repo owner. MiniMax H3 specifically is exploratory and not a required integration.
**This ticket is the path by which that separate plugin repository is consumed**,
and **no work in it requires the plugin repository to exist** — every acceptance
criterion below is testable against a stock ComfyUI plus a template that declares
nodes nobody installed.

### What loop-lore may do: documented ComfyUI REST endpoints only

The allowlist is fixed and already implemented end to end by `ComfyUIClient`
(`src/generation/providers/comfyui.ts:89-354`): `submitWorkflow` (`:115`,
`POST /prompt`), `pollResult` (`:145`, `GET /history/{id}`), `waitForFiles` /
`waitForCompletion` (`:203`, `:234`), `cancelExecution` (`:243`,
`POST /interrupt`), `getNodeInfo` (`:256`, `GET /object_info`), `downloadImage` /
`downloadFile` (`:278`, `:293`, `GET /view`), `runWorkflow` / `runWorkflowFiles`
(`:316`, `:333`), `uploadImage` (`:351`, `POST /upload/image` via
`uploadImageToComfy`). `GET /queue` is on the documented surface but the client
does not call it today — progress polling goes through `/history`; a future queue
read stays on that endpoint and never on a plugin route.

The client sends **no `client_id`** and opens **no `/ws`** connection. Both are
`epic-comfyui-plugin.md` Phase 0 / Phase 4 items, tracked in
`TASK-comfyui-ws-client-id-progress-reference-generation.md`. **Declared as a
dependency; not duplicated, not implemented, and not re-worded here.**

### What loop-lore must NOT do

1. **Never vendor, install, re-ship, or maintain ComfyUI custom nodes.** No `.py`
   in this repo, no `custom_nodes/` path, no plugin installer, no served SPA
   assets. A plugin repo is someone else's git history.
2. **Never call a plugin's private HTTP contract.** The reviewed H3 stills
   sidecar is the worked example of what is refused: it registers 11 routes on
   `PromptServer.instance.routes` (`__init__.py:21`) behind a loopback-only
   `private_request` guard (`:24-28`), and `NODE_CLASS_MAPPINGS = {}` (`:206`) —
   it contributes zero node types and is a route bundle, not a node. Its
   `/h3-stills/*` set, its SPA, and its `prepare`/`register`/`run_workflow`
   endpoints are the plugin repo's business, not loop-lore's.
3. **Never encode a plugin's hardcoded literals in code.** The same sidecar's
   `normalize()` (`studio_stills.py:114-181`) pins steps to exactly 8 (`:123`),
   sampler to `euler` (`:124-125`), sigma shifts to 8.0/3.0 (`:126-127`), the model
   basename to one b30-49 hybrid (`:128-132`), CLIP/VAE/audio-VAE to three
   literals (`:133-135`, constants at `:17-20`), reference megapixels to 1.0
   (`:136-137`), and **exactly one LoRA whose SHA-256 must equal a hardcoded
   constant** (`studio_loras.py:11-12`, checked at `:170-171`). The 4.2-megapixel
   canvas cap is annotated as a *"5080 handoff"* limit (`:120`) — a property of one
   operator's GPU, not of the model. Those literals are the bug being removed:
   they belong in per-family preset data
   (`epic-model-family-presets.md`) and template **parameters**
   (`TASK-minimax-h3-stills-reference-template.md`), never in `.ts`.

### Prerequisite declaration — a template names what it needs

`WorkflowTemplate.required_nodes` is the declaration (`epic-comfyui-plugin.md`
Design §Workflow Template; a config workflow's `class_type` set is its
equivalent). `TemplateRegistry.listAvailable(backend, installedNodes)`
(`src/image-edit/template-registry.ts:117-132`) is the filter that consumes it:
templates whose `backends` include the backend **and** whose every
`required_nodes` entry is in the installed set.

**It is implemented and has no production caller.** `grep -rn listAvailable src/`
matches the definition itself and a comment in
`src/generation/workflow-library/validate.ts:15` pointing at it as the right home
for subset-checking; `handleTemplates` (`src/image-edit/routes.ts:135-154`)
filters by `listForBackend` / `listByCategory` only. So today
`GET /api/v1/image-edit/templates?backend=comfyui` offers a template whose nodes
are absent, the user picks it, and the failure arrives as a ComfyUI graph
rejection at `/prompt` after the wait. The wiring itself is owned by
`TASK-comfyui-node-discovery-template-autofilter.md` (bound to
`epic-reference-conditioned-generation`); this ticket depends on that wiring and
does not restate its acceptance criteria.

### Deployment prerequisite surfaced, not worked around

A plugin repo's prerequisites are deployment facts, and loop-lore must show them
rather than route around them. The sidecar's own declaration is the worked
example of the shape: it **requires six externally installed node types**
(`__init__.py:19-20`) — `MiniMaxH3ReferenceToVideo`, `FizgigH3StillLatent`,
`FizgigH3StillDecode`, `MiniMaxH3SigmaShift`, `ImageBlur`,
`ModelAttentionBackend` — plus pinned model/CLIP/VAE files and one hash-pinned
LoRA. An operator must see that list without reading the plugin's Python.

Ground truth: **no admin ComfyUI surface exists** —
`epic-comfyui-first-class-citizen.md` Current State, "Admin ComfyUI panel — None:
no routes, no view, no Alpine component"; `system_config` carries `comfyui_url` /
`comfyui_enabled` and nothing reads them at generation time. So the operator
surface named below is new work, dependent on that epic's admin panel.

### Version / compatibility — minimal on purpose

A plugin's interface is versioned by **the node types it registers**, and
loop-lore's probe reads them from `GET /object_info` through the existing
`getNodeInfo()` (`src/generation/providers/comfyui.ts:256`). `handleNodes`
(`src/image-edit/routes.ts:160-168`) already returns that installed set from the
same call, so there is **one** probe, not two. No new endpoint, no handshake, no
plugin manifest format, no capability-negotiation protocol — a plugin publishes
anything beyond node names in its own repository, and loop-lore records only what
it can observe in `/object_info`. A breaking change upstream (renamed or removed
node type, new required input) surfaces as a changed entry in that response, which
flips the template from *available* to *unavailable* and names the difference —
before submission, not as a graph rejection.

### Epic binding

Bound to `epic-comfyui-plugin` because the contract constrains exactly the
machinery that epic owns: the fixed REST contract it declared in *Integration
Decision* ("new usecases are workflow templates consumed by the existing call,
not new endpoints"), the `WorkflowTemplate` interface and its `required_nodes`
field, the registry, and `/object_info` node discovery. Its Phase 0 `client_id`
and Phase 4 `/ws` items stay owned there and are the declared dependency.
`epic-reference-conditioned-generation.md` is where the separate-plugin-repo
decision was recorded and is a *consumer* of this contract, so it is cited under
**Related:** rather than bound here. `epic-comfyui-first-class-citizen.md` owns
the admin surface the operator listing hangs off and is likewise a dependency,
not the binding.

## Acceptance Criteria

- [ ] Every ComfyUI HTTP call under `src/generation/providers/` and
      `src/image-edit/providers/` targets one of the documented endpoints
      (`/prompt`, `/history/{id}`, `/interrupt`, `/view`, `/upload/image`,
      `/object_info`, `/queue`). Verified by listing every
      `` `${...baseUrl}/...` `` / `fetch(` URL in those two directories; a call to
      any other path — including a plugin's private route such as the sidecar's
      `/h3-stills/*` bundle — is a failure.
- [ ] No ComfyUI custom-node code enters this repository: the diff adds no `.py`
      file, no `custom_nodes/` path, no `NODE_CLASS_MAPPINGS`, no plugin
      installer, and no `web/` SPA assets (`git show --stat` on this ticket's
      commit lists none).
- [ ] The H3-specific literals appear nowhere in `src/**/*.ts`: `sigma_shift`,
      `MiniMaxH3SigmaShift`, `ModelAttentionBackend`, `comfy kitchen attention`,
      `FizgigH3StillLatent`, `reference_megapixels`, a Dareties LoRA SHA-256
      constant, and a `steps` value pinned with `min === max === 8` all return
      zero matches after this ticket (verified zero on 2026-10-16, before it).
      Generic sampler defaults (`"euler"` in `src/generation/prompt-templates/`,
      `src/generation/workflow-substitutor.ts:209`) are unrelated to the sidecar
      and stay.
- [ ] A workflow template declaring externally installed node types fails
      **before** `POST /prompt` when they are absent, with an error naming the
      absent `class_type`s. Test: a template declaring the six H3 stills node
      types against a `/object_info` response that lacks them issues no
      `/prompt` request and returns the named-missing-node error.
- [ ] `listAvailable` (`src/image-edit/template-registry.ts:117`) is the single
      availability decision — it has at least one production caller, and
      `grep -rn "required_nodes" src/` shows the declaration plus that one
      consumer, with no parallel required-node filter.
- [ ] An operator surface names, per configured ComfyUI backend, the missing
      external node types (`required_nodes` minus the `/object_info` key set) and
      the pinned model/LoRA files the template needs, without reading plugin
      source. An unreachable ComfyUI and "reachable, zero matching nodes" are
      distinguishable responses. Any persistence this needs follows the
      append-only policy in `src/db/migrations/README.md` and lands in the
      implementing ticket, not here.
- [ ] The compatibility probe reads `GET /object_info` only, through the existing
      `getNodeInfo()`. Test: renaming one node type in a stubbed `/object_info`
      response flips a template that declares it from available to unavailable and
      names the changed type.
- [ ] Nothing here requires the external plugin repo to exist: the criteria above
      pass against a stock ComfyUI plus a template that declares unavailable
      nodes, and `grep -rn "h3-stills" src/ configs/` is empty.
- [ ] No new workflow-template DSL, no new `AssistantIntent` member, no transport
      endpoint, no `client_id` / `/ws` implementation, and no training,
      fine-tuning, or benchmarking harness is added by this ticket.
- [ ] `bun run check` green.
