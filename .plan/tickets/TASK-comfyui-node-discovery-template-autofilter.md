<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Node-driven template auto-filtering — wire the unwired path

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-node-discovery.md`, `TASK-comfyui-template-registry.md`, `TASK-reference-capability-probe-runtime.md`, `TASK-minimax-h3-stills-reference-template.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`/object_info`-driven template filtering is implemented and unwired. Connect it, so
a template whose node pack is missing is hidden or clearly marked rather than
submitted into a graph that cannot resolve.

## Context

The epic checklist says this is done:

- `epic-comfyui-plugin.md` Phase 4: "[x] ComfyUI node discovery via `/object_info`"
  and "[x] Auto-filter templates by installed nodes"
- `TASK-comfyui-node-discovery.md` is **Done**
- `TASK-comfyui-template-registry.md` is **Done**

The code says otherwise, for the second item.

`TemplateRegistry.listAvailable(backend, installedNodes)`
(`src/image-edit/template-registry.ts:117-128`) is exactly the auto-filter: it
returns templates whose `backends` include the backend **and** whose every
`required_nodes` entry is in the installed set. Its JSDoc says "the templates
runnable on that backend with every required node installed".

**It has no production caller.** Grepping `src/` finds `listAvailable` only in
`src/image-edit/template-registry.ts` itself; the only other hit is a comment in
`src/generation/workflow-library/validate.ts:15` pointing at it as the right home
for subset-checking. `handleTemplates` (`src/image-edit/routes.ts:135-154`) filters
by `backend` via `listForBackend` and by `category` via `listByCategory` — neither
consults `/object_info`.

So today `GET /api/v1/image-edit/templates?backend=comfyui` returns a template
whose required nodes are absent, the user picks it, and the submit fails at
`/prompt` with a node-resolution error after waiting. `handleNodes`
(`routes.ts:160-168`) does expose the installed set, but the client has to join the
two lists by hand.

Why it matters more now: the reference-edit templates name external node packs.
The MiniMax H3 stills template alone requires six node types installed separately
(`MiniMaxH3ReferenceToVideo`, `FizgigH3StillLatent`, `FizgigH3StillDecode`,
`MiniMaxH3SigmaShift`, `ImageBlur`, `ModelAttentionBackend`). On a stock ComfyUI,
all six are missing.

Also worth checking while here, since `required_nodes` becomes load-bearing:
`registerConfigWorkflows` (`template-registry.ts:165-181`) hardcodes
`required_nodes: []` for every config-derived workflow. A config workflow will
therefore always pass the filter, even when its graph needs nodes that are not
installed. Either derive `required_nodes` from the graph's `class_type`s or record
why a config workflow is exempt.

Do not edit `epic-comfyui-plugin.md`'s checklists from here — other work is in
flight against them. This ticket's Context records the discrepancy.

## Acceptance Criteria

- [ ] `handleTemplates` consults `/object_info` and either filters to available
      templates or returns an explicit per-template availability flag; the contract
      is chosen deliberately, not left implicit, and the frontend-facing shape is
      documented
- [ ] `listAvailable` gains a production caller — no second filtering
      implementation is written
- [ ] Node discovery is cached with a bounded TTL and an explicit refresh path;
      `ComfyUIEditProvider.refreshNodes()`
      (`src/image-edit/providers/comfyui-provider.ts:115-117`) is the refresh hook and
      must not become a second source of truth
- [ ] An unreachable ComfyUI is not the same as "no nodes installed" — the two
      produce distinguishable responses
- [ ] `registerConfigWorkflows` either derives `required_nodes` from the graph or
      documents the exemption; the silent `[]` is gone
- [ ] Test: a template whose required node is absent is not offered as available;
      a present one is; ComfyUI-unreachable and zero-nodes are distinguishable
- [ ] `bun run check` green
