<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI Admin Panel — Workflow Management + Parameterized Templates

**Effort:** Medium
**Summary:** Give admins a ComfyUI surface (list / upload / enable / default workflows) and make config-declared workflows actually honor their parameters.
**Context:** The admin panel has no ComfyUI tab at all. Separately, `registerConfigWorkflows` registers config workflows with a `build()` that ignores `params` entirely and returns static `nodes`, so `{{placeholder}}` values in a config-declared workflow are never substituted.
**Acceptance Criteria:** A working admin ComfyUI tab with upload, and config-declared workflows whose `{{var}}` placeholders substitute from request params.

**Priority:** P1 — High
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** `TASK-comfyui-first-class-workflow-library`, `TASK-comfyui-workflow-parameterization`

## Description

Two coupled gaps. Both sit between “the backend can run a workflow” and “an
operator can actually configure one”.

### Gap A — no admin ComfyUI surface

The admin panel is a single-page Alpine app: `src/frontend/alpine/admin.ts` holds a
tab registry and a `showTab` switch (lines 78-137), with each tab a
sub-component object spread into the state. There is no ComfyUI tab, no view, no
component, no routes.

Existing surfaces to mirror:

- Admin CRUD route pattern: `src/routes/admin/templates/` (barrel at `index.ts`,
  then `list.ts` / `update.ts`).
- Alpine tab pattern: `src/frontend/alpine/admin-system.ts`
  (`loadSystemConfig` / `saveSystemConfig`).
- Flat config persistence: `src/routes/admin/system-config.ts` — but see the
  library ticket for why the workflow library itself is a table, not KV.

`comfyui_url` and `comfyui_enabled` already exist as `system_config` keys and are
written by `src/frontend/alpine/admin-models/sd.ts:82-84`, but **nothing reads
them at generation time** — the engine resolves `baseUrl` from
`config.generation.providers.sd[]` via `pickSdProvider()`. Either wire these keys
into resolution or fold them into the library surface; leaving them write-only is
the worst outcome (an admin toggles a switch that does nothing).

### Gap B — `registerConfigWorkflows` drops parameters

`src/image-edit/template-registry.ts:117-136`:

```ts
parameters: [],
build: () => (workflow.nodes as ComfyUIWorkflow) ?? {},
```

`params` is never read. A config-declared workflow with `{{prompt}}` submits the
literal string `{{prompt}}` to ComfyUI. The registry advertises the workflow but
cannot parameterize it, so uploads would land in the same broken state.

Fix: declared `params` become `TemplateParameter[]` (reuse the shape in
`src/image-edit/types.ts:59-70`) and `build` routes the body through
`substituteWorkflow` with the request params. One workflow then drives both the
UI form and server-side validation.

## Acceptance Criteria

### Admin surface

- [ ] `comfyWorkflowsRoutes` under `src/routes/admin/comfy-workflows/`: list,
      create, update, delete, upload, set-default — mirroring
      `src/routes/admin/templates/` (barrel + per-action modules).
- [ ] Registered in `src/routes/admin/index.ts` behind the existing
      permission-based guard (`admin.*`), matching `systemConfigRoutes`.
- [ ] Admin view + Alpine component; tab added to the `showTab` switch in
      `admin.ts` and the component spread into state.
- [ ] Upload accepts a workflow JSON file via multipart, writes it under
      `configs/workflows/uploads/`, and upserts the DB row in the same operation
      — disk and DB must not diverge on partial failure.
- [ ] Upload surfaces ingest validation errors (reject reasons from the library
      ticket) to the admin, not a generic 500.
- [ ] List view groups by family/category and shows enabled + default state.
- [ ] Delete removes both the row and the file; set-default clears the previous
      default for that (family, category).
- [ ] `comfyui_url` / `comfyui_enabled` are either wired into base-URL resolution
      or removed — not left write-only.

### Parameterized templates

- [ ] `registerConfigWorkflows` builds `parameters` from the config-declared
      params rather than hardcoding `[]`.
- [ ] `build` runs `substituteWorkflow(body, params)`; a config workflow with
      `{{prompt}}` produces a substituted graph, not a literal placeholder.
- [ ] Required-param validation works for config workflows (missing required
      param → 400 with the parameter name), matching `handleRun`'s existing check
      at `src/image-edit/routes.ts:97-106`.
- [ ] Numeric params substitute as **numbers** (depends on
      `TASK-comfyui-workflow-parameterization` Defect 1 — this path is one of
      the things that fix unblocks).
- [ ] Unit tests: a config workflow with `{{prompt}}` + `{{seed}}` substitutes
      both, and the seed is a number.

## Technical Notes

- Reuse the `handleUpload` multipart pattern (`src/assets/controller.ts:478`) and
  its parent-app registration (`src/elysia-app.ts:210-214`); registering the
  upload route on the child Elysia app is a known body-consumption trap.
- The admin permission guard is permission-based (`admin.*`), not
  `isAdminRole` — tester holds `["*"]`, moderator does not. New routes follow
  the existing guard, not a bespoke role check.
- Do not add a raw JSON editor to the admin panel. Upload + metadata editing only
  (epic Open Question 3): the ingest validator is the safety net, and a free-form
  editor bypasses it.
- `ImageEditWorkflowConfig` (`src/config/sections/templates.ts:145-153`) has no
  `params` field today — it needs one before Gap B is possible. Same for
  `lora_slots` on the library row.


git issue: 4baa39c
