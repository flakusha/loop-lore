<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI output/input directory config for managed spawner

**Effort:** Small
**Summary:** No output-folder concept exists in the loop-lore config schema, and no ticket owns one. Without it a managed ComfyUI writes to an unknown path loop-lore never reads.
**Context:** Found by investigation 2026-09-27 (`docs/meta/research/comfyui-first-class-investigation.md` §1). Genuinely unowned gap — the standalone auto-start ticket (`5bd5c7e`) does not mention an output folder.
**Acceptance Criteria:** `ComfyUIAutoStartConfig` carries input/output roots; the spawner passes `--output-directory`; retrieval keeps working.

**Priority:** P2 — Medium
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** TASK-comfyui-first-class-standalone-auto-start-config-lifecycle (issue `5bd5c7e`)

## Description

### Current state

There is **no** `output_dir` / `models_dir` concept in the loop-lore config
schema. `${models_dir}` in `configs/config.llama-swap.example.yaml:44` is a
*llama-swap* macro, not a loop-lore value.

`ComfyUIAutoStartConfig` **does not exist yet** — `src/config/schema/auto-start.ts:168-184`
defines only `LlamaCpp`, `SdCpp`, and `LlamaSwap` variants. The auto-start ticket
that will create it does not cover output folders.

### Why it matters

A loop-lore-managed ComfyUI process needs a filesystem location for generated
images. Today that is implicit in the ComfyUI install, which means loop-lore
cannot reason about cleanup, disk usage, or where an operator should look for
artifacts. It also collides with the operator's own `filename_prefix` convention.

### The `filename_prefix` problem

The operator's Anima reference hardcodes
`"filename_prefix": "comfyui/anima/anima-0001-<timestamp>"`
(`configs/workflows/uploads/i-anima-0001.json:33`). That path is **relative to
ComfyUI's own `output_directory`**, not to loop-lore. Two reconciliations are
possible:

1. Launch the process with `--output-directory <outputDir>`, so the operator's
   prefix composes correctly under a loop-lore-controlled root. **Preferred.**
2. Ignore the prefix and match returned filenames by `prompt_id`.

Option 1 is honest (the operator's workflow means what it says) and makes cleanup
and disk accounting possible. Option 2 works but leaves files scattered wherever
ComfyUI's defaults point — typically inside the ComfyUI install.

### Naming: run directories, not workflow directories

Use uuid-named **run** subdirectories under a per-process root, not
uuid-per-workflow directories:

```
outputDir/
  <runId>/
    2026-09-27/anim-0001_12345_0_.png
```

A per-process root with uuid run dirs survives a restart and keeps runs
separable. A uuid-per-workflow dir does not compose with a restarting process.

## Acceptance Criteria

- [ ] `ComfyUIAutoStartConfig` gains filesystem roots, with defaults under the
      project's scratch space (`.tmp/comfyui-output`, `.tmp/comfyui-input` —
      consistent with the repo's `.tmp/` convention for transient artifacts).
- [ ] The spawner passes `--output-directory <outputDir>` to the ComfyUI process,
      so the operator's `filename_prefix` composes under a loop-lore-controlled
      root.
- [ ] The default `--input-directory` is likewise set to the configured input dir
      when supported by the ComfyUI version; if the flag does not exist, the
      decision is documented rather than silently omitted.
- [ ] Configuration is editable through the admin surface and stored via the
      normal config KV path — no new storage mechanism.
- [ ] `getComfyUIPaths()` (or equivalent) is the single accessor used by both the
      spawner and the retrieval path, so the two cannot disagree.
- [ ] Existing image retrieval via `prompt_id` still works unchanged. This is a
      config change, not a retrieval rewrite.
- [ ] A test asserts the spawn args include `--output-directory`.
- [ ] Documented for the standalone (non-llama-swap) mode, where the operator
      supplies the ComfyUI binary directly and loop-lore has no proxy to configure.

## Technical Notes

- **Depends on `5bd5c7e`.** The config variant does not exist yet; this ticket adds
  fields to something that ticket creates. Sequence them, do not parallelize.
- `src/services/server-external-manager/start-llama.ts:167-180` reads
  `startPort` from the config file and spawns with `--config <path>`. **loop-lore
  never writes a config file** — so do not design a generated-config writer here.
  That was considered and rejected in favour of storing graphs inline
  (see the epic's amended storage decision).
- Related: a full VRAM-awareness gap is documented in the research (§4.4) but is
  deliberately **not** this ticket. A `min_vram` declaration per workflow is a
  separate concern; do not fold it in.
- Do not add retention/cleanup logic. Disk growth is real, but inventing a policy
  before anyone has used the feature is premature. Note the concern in the epic.


git issue: f2b36c5
