<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI Workflow Library (DB-Backed)

**Effort:** Medium
**Summary:** Make workflows a first-class, operator-manageable library instead of hardcoded files in `configs/workflows/`.
**Context:** `WorkflowLoader` scans a directory by mtime and derives the workflow name from the filename. No metadata, no DB, no way to categorize, enable, or version. ComfyUI is declared first-class citizen at the *backend* layer but not the *artifact* layer.
**Acceptance Criteria:** A `comfy_workflows` table, disk-seeded boot migration, and validation gates; uploaded workflows are discoverable through the existing template listing route.

**Priority:** P1 — High
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** `TASK-comfyui-workflow-parameterization` (Defect 3 supplies the dead-node rule this validates with)

## Description

Phase 1 of `epic-comfyui-first-class-citizen`. Today a workflow exists only as a
file in `configs/workflows/`, named by its filename. There is no place to record
its model family, category, declared parameters, LoRA slots, enabled state, or
which one is the default. An operator who exports a workflow from ComfyUI has no
way to make it usable in the app without hand-editing config and restarting.

A new `comfy_workflows` table is the source of truth for *what workflows exist*
and *which are active*. The JSON body stays on disk: workflow JSON is large,
diff-friendly, and belongs in git rather than a KV blob.

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

### Why not the existing KV store

`system_config` (`src/db/schema-core.ts`, migration `001_init.ts:190-197`) is flat
string key/value: no indexing, no uniqueness constraint, no list query. A library
needs list-by-family, one-default-per-(family,category), and enable/disable.
Forcing that into one JSON blob means read-modify-write races and no partial
updates. The existing `getAllConfig`/`setConfig` helpers stay for the flat
`comfyui_url` / `comfyui_enabled` keys.

### Seeding

First boot seeds rows from `configs/workflows/*.json`. The two existing files
(`txt2img`, `img2img`) become rows with their filenames as ids, so no existing
caller moves. Seeding is idempotent — re-running must not duplicate or clobber
admin edits.

### Ingest validation

A bad workflow stored now fails confusingly at 3am inside a generation queue, so
reject at upload:

- Parses as JSON; every entry has `inputs` + `class_type`.
- Declared `params` each exist as a `{{placeholder}}` in the body.
- Declared LoRA slots resolve to real nodes in the graph.
- **Dead nodes are rejected** (operator decision, 2026-09-27). Terminal sinks are
  excluded from the dead set — see the epic's Defect 3 — so `SaveImage` passes but
  an unreferenced `CLIPLoader` fails the upload. The error names the offending
  node ids so the operator can fix the export.
- `required_nodes` validated as a **subset** of installed nodes, never an exact
  match: real exports install nodes they do not use.

## Acceptance Criteria

- [ ] Migration `021_comfy_workflows` created (append-only; `020_` is the current
      head). Generated schema files regenerated via `bun run db:sync-*`, never
      hand-edited.
- [ ] First-boot seed creates rows for the existing `configs/workflows/*.json`,
      idempotent across re-runs, and does not clobber admin-edited rows.
- [ ] Ingest validation rejects: unparseable JSON; entries missing `class_type`;
      a declared param with no matching placeholder; a LoRA slot naming a
      nonexistent node.
- [ ] Ingest validation **rejects** a workflow carrying a dead node, naming the
      offending node ids in the error.
- [ ] Ingest validation **accepts** the Anima reference workflow once its dead
      `60:45` `CLIPLoader` is removed (9 nodes; `46` `SaveImage` correctly treated
      as a terminal, not dead). The cleaned variant lands as the first library row;
      the unmodified export stays committed as the reference fixture under
      `configs/workflows/uploads/`.
- [ ] `GET /api/v1/image-edit/templates` lists library workflows alongside the TS
      builtins, so an uploaded workflow is discoverable without a restart.
- [ ] Model-family detection does **not** rely on `CheckpointLoaderSimple` — the
      Anima reference uses `UNETLoader` + `CLIPLoaderGGUF` + `VAELoader`. Family is
      declared on the row.
- [ ] `at most one is_default per (family, category)` enforced in code.
- [ ] Unit tests cover validation accept/reject cases and the default-uniqueness
      rule.

## Technical Notes

- `WorkflowLoader` (`src/generation/workflow-loader/loader.ts`) caches by
  directory mtime. Uploaded files land in a subdirectory, so the parent's mtime
  changes on create but **not** on overwrite — either put uploads in their own
  scanned dir or call `reload()` explicitly after write.
- Reuse the `handleUpload` multipart pattern from `src/assets/controller.ts:478`,
  including the parent-app registration in `src/elysia-app.ts:210-214` — Elysia
  body consumption on child apps is a known trap, not a hypothetical.
- `src/image-edit/template-registry.ts:117-136` (`registerConfigWorkflows`)
  currently returns static `nodes` and ignores `params`; routing library workflows
  through it as-is would silently drop parameterization. That is Phase 2 scope
  (`TASK-comfyui-first-class-admin-workflows.md`) but the registry shape is
  decided here.
- Node ids are opaque strings — the library must never parse them as integers
  (see `TASK-comfyui-workflow-parameterization` Defect 2).


git issue: c79d1ae
