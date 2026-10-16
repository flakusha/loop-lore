<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI PBR texture set generation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** derived-map-generation
**Tags:** comfyui, textures, pbr, workflow-templates
**Depends on:** `TASK-derived-map-origin-links`
**Related:** epic-3d-generation.md, epic-asset-platform-capabilities.md

**Summary:**

One prompt → a PBR derivative set (albedo, normal, roughness) stored as three linked assets under the source prompt's owner.

**Context:**

No texture-map generation exists today; `epic-3d-generation.md` has no material source. v1 uses a tileable albedo generation plus normal via sobel of the depth preview or a dedicated node (decision recorded in the epic's open questions), all through the same template seam.

**Acceptance Criteria:**

- [ ] Template(s) registered so a single run produces albedo + normal + roughness outputs (one graph, multiple SaveImage outputs, or a set graph — record which)
- [ ] Each map stored as its own `image/png` derivative with the per-map `derived-from:<map>` origin link; dedup does not collapse albedo and normal onto one row (`dedupe: false` pattern from `src/generation/matting/service.ts:207`)
- [ ] Set membership queryable: "give me the PBR set for prompt run X" — origin links answer it without a new schema
- [ ] `prompt` and any numeric params (`tile_size`, `roughness_offset`) validated at the boundary by a reused schema (bounded length/charset/range), fast-failing 400 before the run
- [ ] Test: fixture graph against the fake ComfyUI server yields three derivatives, each linked; a second run of the same prompt does not overwrite the first set
- [ ] `bun run check` green

## Technical Notes

- v1 surface: albedo + normal + roughness. Metallic/AO/height only if the 3D epic asks.
- Normal map from a sobel of the depth preview keeps the node count minimal (epic open question default).
- No new asset kind: maps are ordinary image assets distinguished by origin link.