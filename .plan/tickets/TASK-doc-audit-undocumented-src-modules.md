<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit & document remaining undocumented src/ modules

**Status:** ⬜ Not Started
**Priority:** P3
**Epic:** epic-docs-reconciliation
**Labels:** docs, spec, reconciliation
**Related:** src/content/*, src/aux-pipeline/*, src/image-edit/*, src/group-chat/* (frontend doc exists)

## Summary

Beyond the three README-flagged "spec pending" features, several implemented
`src/` modules have no documentation at all:

- `src/content/` — hash injection, compression, encode/decode, minify (10 files)
- `src/aux-pipeline/` — auxiliary LLM pipeline (index/prompts/runner/types)
- `src/image-edit/` — image editing providers (comfyui, sd-server) + templates
  (controlnet, img2img, inpaint, lora, txt2img, upscale) — distinct from the
  existing `docs/spec/integrations/image-generation.md` (generation, not editing)

These are current project features absent from both the README feature list and
`docs/`. Out of scope for the initial spec-doc pass; tracked here for a follow-up
audit + spec-doc sweep. Also consider auto-generating the API reference from
JSDoc/TSDoc (see `docs/reference/api.md`, currently hand-maintained) per the
project's automated-API-documentation guidance.

## Acceptance Criteria

- [ ] Each undocumented module above has a spec doc or an explicit "out of scope" decision
- [ ] VitePress sidebar updated where docs are added
- [ ] README features table reconciled (add rows or link specs)
