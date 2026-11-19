<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Export production MiniMax H3 workflow JSONs

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, comfyui, video, operator
**Caveats:** operator dependency, external ComfyUI UI, node-pack availability, graph drift

**Summary:**
B2 blocker: no production H3 workflow JSON exists in configs/workflows/ (only img2img.json, txt2img.json), so startIvssFragmentRun cannot complete a real fragment. The OPERATOR exports the five workflows from the ComfyUI UI per the naming contract (.tmp/research/minimax-h3-workflow-names-2026-11-19.md). This ticket is the operator-side export checklist plus the mechanical gates already landed on the branch: loader substitution, sink classification, requiredNodes declaration, and the latent_not_captured run-time gate (H2).

**Context:**
Naming rule `minimax-h3-<mode>-<purpose>-v<N>`; graphs pinned by workflow_hash in scenario_fragments. The shot-grammar compiler emits BOTH `duration_frames` (integer, DB column) and `duration_seconds` (3-decimal float, shot-grammar.ts:205), so the Director `duration` FLOAT input binds `{{duration_seconds}}` directly — no conversion node. NOTE: the naming doc's export-contract item 6 first draft (which claimed the compiler emits no duration_seconds) is stale; the doc now records the dual emission.

**Export checklist (operator, per name):**

| Name | Use | Variables |
|---|---|---|
| minimax-h3-t2v-fragment-v1 | text→AV scene fragment | prompt, timeline_data, builder_state, duration_seconds, seed, reference_slots |
| minimax-h3-i2v-fragment-v1 | still-anchored scene | same six |
| minimax-h3-ref2va-fragment-v1 | audio/video-referenced scene | same six |
| minimax-h3-fragment-assemble-v1 | join/retake splice, no sampler | segment_slots, transition, fps |
| minimax-h3-audio-fallback-v1 | opt-in video→sound pass | video_slot, prompt, seed |

For every export:


git issue: 2722132

1. ComfyUI "Export (API)" format — UI-format JSON is skipped by the loader (loader.ts strict ingest).
2. `{{var}}` placeholders are literal strings in node inputs; `reference_slots` is a JSON string consumed by LoadImage/mask paths.
3. Video sink in a video-classified bucket: DaSiWa_EnhancedVideoCombine (gifs bucket) or any sink the poll classifies as video; core SaveVideo works via the animated marker/extension fallback.
4. Fragment graphs: latent capture. VERIFIED node inventory (.tmp/research/minimax-h3-export-cheatsheet-2026-11-19.md §6 gotcha 3): NO installed node writes an H3 NestedTensor latent package into the `files` bucket today — `ModelSaveKJ` (KJNodes nodes.py:2155-2199) writes a MODEL state dict, not a latent; `MiniMaxH3LQPackageSave` (LatentUpscaler stash.py:687-812) writes the true latent package (latent.safetensors + conditioning.pt + meta.json under output/h3_lq_stash/...) but is NOT an OUTPUT_NODE and returns only a `package_path` string; stock `SaveLatent` crashes on NestedTensor. Item 4 as originally drafted ("latent package into the files bucket") is therefore unsatisfiable via that route. **DECIDED 2026-11-19 (option b, implemented):** fragment graphs MUST wire `MiniMaxH3LQPackageSave` (its `samples` input ← the sampled latent) and declare it in requiredNodes; loop-lore's poll side maps the node's `package_path` string (absolute package-dir path under the ComfyUI output dir, stash.py:812) into a `GET /view?filename=latent.safetensors&subfolder=h3_lq_stash/...&type=output` fetch and captures the latent (`comfyui-poll.ts` `latentPackageDescriptor`). Option (a) — a ComfyUI wrapper node re-emitting LQPackageSave's package as a ui `files` entry — is the documented FALLBACK if (b) proves brittle (note: LQPackageSave is not an OUTPUT_NODE, so whether its string appears in `/history` outputs depends on the ComfyUI version's history recording; if it does not, the wrapper node becomes mandatory). Option (c) rejected. The run-pipeline `latent_not_captured` gate remains the safety net: it fires only when the completed graph produced neither a files-bucket latent entry nor a package_path output.
5. requiredNodes are declared at seed/admin ingest (derived from the graph's class types, seed.ts readPayload; UI-format admin ingest derives the same way) and checked against the live /object_info on the admin workflow surface (missingRequiredNodes) — the reconstructed fixture object-info.json is never relied on.
6. Bind the Director `duration` FLOAT input to `{{duration_seconds}}`; the compiler emits duration_seconds (3-decimal float) and duration_frames (DB integer).
7. Model file names are a discovery/config contract, not workflow variables.

**Acceptance Criteria:**

- [ ] All five JSONs exist in configs/workflows/ named exactly as above (no .json in the loader/fragment workflow_id)
- [ ] Each passes the catalog-readiness assertions: loader accepts and substitutes its variable surface; sinks are registered terminal sink classes
- [ ] Fragment runs capture the latent — via the files bucket or the `MiniMaxH3LQPackageSave` `package_path` fetch (option b, implemented 2026-11-19); a graph producing neither still fails with `latent_not_captured`
- [ ] A real startIvssFragmentRun completes end to end on the operator box
