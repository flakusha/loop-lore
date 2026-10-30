<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Fixture provenance (read before copying any pattern out of here)

## What these files are

- `v-0010-dasiwa-minimax.json` (~295KB) is the **operator's own ComfyUI
  editor save** — a UI-format workflow snapshot used here as a **test
  input only**. It is data, not code: no behavior is imported from it,
  and no license is re-licensed through it. Some of the custom-node packs
  referenced inside it are GPL-licensed; that affects neither the fixture
  (an editor save, not a derivative of pack code) nor the converter
  (which never executes, imports, or quotes pack code).
- `i-0037-moss-edit-s.json` (16KB) is a second operator editor save used
  as the subgraph-free round-trip control.
- `i-0037-moss-edit-s.expected.json` is **hand-derived by the implementor**
  field-by-field from the control save above — it is our own work.
- `object-info.json` (60 classes) is a **reconstructed** `/object_info`
  snapshot: shapes transcribed from pack `INPUT_TYPES` sources plus UI
  evidence in the fixtures. Provenance per class in `_source`; the build
  script lives at repo `.tmp/build-object-info.py` (scratch, not
  committed). It is not a live-server dump.

## How the conversion algorithm was written (binding-contamination rule)

The algorithm is implemented from **observed graph behavior** — node,
link, and boundary shapes as they appear in the fixtures themselves —
plus two license-clean references:

- The Unlicense-licensed SethRobinson converter
  (`https://github.com/SethRobinson/comfyui-workflow-to-api-converter-endpoint`)
  as the reference implementation.
- The MIT-licensed comfy-workflow-studio analyzer
  (`py/services/workflow_analyzer.py`, MIT (c) 2026 ketle-man) for
  traversal primitives — see the attribution comment in
  `../types.ts`. Its `CLAUDE.md` documents `widgets_values` positional
  fragility, cited as justification for name-first mapping.

**ComfyUI frontend source (`ComfyUI_frontend`, GPL-3) was never used as
source.** No frontend file was quoted, pasted, or ported line-by-line
into this repo — verified: the module contains no `graphToPrompt` /
`executionUtil` text or any `frontend/src` path reference. Frontend
behavior is described only where the ticket spec requires it ("matches
frontend export" for muted/bypass pruning), and those descriptions are
behavioral, derived from the saved-workflow evidence (mode flags,
pruned dangling inputs), not from frontend code. The same clean-room
rule applied to krita-ai-diffusion (GPL-3, study-only: only four pack
pin hashes recorded in a comment in `../convert.ts`, no code ported).

If you extend these fixtures or the converter: keep it that way. Read
saves and license-clean references; never paste frontend or pack source
into `src/`.
