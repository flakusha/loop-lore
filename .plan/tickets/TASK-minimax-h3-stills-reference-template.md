<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: MiniMax H3 stills reference workflow template (exploratory — conditional on the plugin repo)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-comfyui-graph-builder-ts-port.md`, `TASK-stills-lifecycle-queue-progress-client.md`, `TASK-lora-audit-standalone.md`, `epic-model-family-presets.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The H3 stills workflow as a native loop-lore template, replacing the Python
sidecar's hardcoded 18-node chain (one non-pose reference) with a config-driven one —
without importing the sidecar's hardcoded literals.

**Exploratory, not a deliverable.** Priority dropped from `medium` to `low`
because MiniMax H3 is the one family of this epic that is **conditional on the
separate ComfyUI plugin repository existing** and on its six external node types
being deployed. loop-lore does not host, vendor, install, or re-ship the plugin,
and no Phase-1 item of the epic depends on this template. Every acceptance
criterion below is therefore gated on that deployment prerequisite; until it is
met the correct state is *specified and not authored*, not *authored around*.

## Context

Source artifact: a Python ComfyUI HTTP-route extension (its `studio_stills.py`, 346
lines), handed over **2026-09-30** by an external acquaintance of the repo owner and
vendored **only** under
`.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/` — a reference artifact,
never an import target. That directory is scratch, gitignored, and was **never
committed**. It was pruned before implementation — which is why this ticket was first
written as an unverified claim — and it **has since been re-acquired and was
functionally reviewed on 2026-10-16 by reading the on-disk source.** It stays a
**review-only reference artifact**: never committed, `.tmp/` only, never an import
target, and nothing in `src/` may reference it. Per the separate-plugin-repo decision
the H3 custom-node half ships from its own plugin repository; loop-lore consumes the
documented ComfyUI REST contract only.

Every chain length, node type, line number, and literal below is verified against that
read — including the node count, which was wrong ("11 nodes" → 16 fixed + 2 per
reference). What is **not** verified is anything that needs a live ComfyUI with the six
external node types installed: that those names resolve in `/object_info`, that the
compiled graph executes, and what VRAM/latency it costs. Where a claim is load-bearing,
the last AC records it.

The reference chain is `studio_stills.py:183-216`, **16 fixed `add()` calls plus 2 per
reference (3 for a `pose_layout` reference) — 18 nodes for a single `identity`
reference, not 11.** Fixed 16, in emission order: `UNETLoader` (`:185`) → chain-wired
`LoraLoaderModelOnly` (`:186-188`, exactly one) → `MiniMaxH3SigmaShift` (`:189`) →
`ModelAttentionBackend` (hardcoded `attention='comfy kitchen attention'`, `:190`) →
`CLIPLoader` (`:191`) → 2×`VAELoader` (`:192`, video + audio) →
`MiniMaxH3ReferenceToVideo` (length 5, `ref_image_size='max'`,
`ref_images:len(references)`, `:193-194`) → `BasicGuider` (`:205`) → `KSamplerSelect`
(`:206`) → `BasicScheduler` (scheduler `'simple'`, `denoise:1.0`, `:207`) →
`FizgigH3StillLatent` (`batch_size:1`, `:208`) → `RandomNoise` (`:209`) →
`SamplerCustomAdvanced` (`:210`) → `FizgigH3StillDecode` (`:211`) → `SaveImage`
(`:212`). Per reference (`:196-204`): `LoadImage`; if the role is `pose_layout`, an
extra `ImageScaleToTotalPixels` (`megapixels:0.01, upscale_method:'area'`, `:199`)
into `ImageBlur` (`blur_radius:3, sigma:3.0`, `:201`); then
`ImageScaleToTotalPixels` (`megapixels:` `state['reference_megapixels']`,
`upscale_method:'nearest-exact'`, `:203`).

**What to take:** the chain shape and the role-dependent reference preprocessing.
The `Graph` builder that emits it is generic and is ported separately in
`TASK-comfyui-graph-builder-ts-port.md`.

**What to refuse — the `normalize()` function is a machine profile pretending to
be validation. [read]** It pins steps to 8 (`_integer(...,'Steps',8,8)`, `:123`),
sampler to `euler` (`:124-125`), sigma shifts to 8.0/3.0 (`:126-127`), the model
basename to one b30-49 hybrid (`:128-132`), CLIP/VAE/audio-VAE to three literals
(`:133-135`, constants at `:17-20`), reference megapixels to 1.0 (`:136-137`), and
**exactly one** LoRA (`:153`) whose SHA-256 must equal a hardcoded constant
(`studio_loras.py:11-12`, checked at `:170-171`). The 4.2-megapixel canvas cap is
explicitly annotated as *"This 5080 handoff limits the canvas to 4.2 megapixels; start
at 2048×1536"* (`:120`) — that is a property of one operator's GPU, not of H3. Also
refused rather than defaulted: non-`euler` samplers, other shifts, non-1.0 LoRA
strength, other checkpoints, and unknown-family LoRAs without an explicit
`experimental_override` (`:166-167`).

The role vocabulary is `ROLES` at `studio_stills.py:14`:
`{'identity','pose_layout','outfit_detail','environment_style','prop'}` — **not**
`:198-204`; `:198-204` is the `pose_layout` preprocessing branch inside
`build_graph` (0.01 MP downscale → `ImageBlur`). The role whitelist is enforced in
`normalize` (`:143`) and drives which references get downscaled/blurred
(`studio_stills.py:196-204`).

Six externally installed node types are prerequisites and are **not** in
loop-lore's control: `MiniMaxH3ReferenceToVideo`, `FizgigH3StillLatent`,
`FizgigH3StillDecode`, `MiniMaxH3SigmaShift`, `ImageBlur`,
`ModelAttentionBackend` (`__init__.py:19-20`). The template's `required_nodes`
must name all six so the auto-filter hides it on a stock ComfyUI instead of
submitting a graph that cannot resolve.

The `minimax-h3` entry in `epic-model-family-presets.md` is specified as a
**video** family (`category: video`, `duration`, `resolution`, `frame_rate`). A
stills template is not that preset. Do not overload the video preset with a stills
template; record the split explicitly.

## Acceptance Criteria

- [ ] **GATE — this whole ticket is conditional.** Authoring begins only when the
      separate ComfyUI plugin repository exists **and** its six external node types
      (`MiniMaxH3ReferenceToVideo`, `FizgigH3StillLatent`, `FizgigH3StillDecode`,
      `MiniMaxH3SigmaShift`, `ImageBlur`, `ModelAttentionBackend`) are deployed and
      resolve in the target ComfyUI's `/object_info`. Until then this ticket stays
      specified and `Not Started`; a partial or substituted template that drops a
      node type is a workaround, not a delivery
- [ ] `configs/workflows/minimax-h3-still.json` reproduces the chain shape with
      sampler / steps / shifts / resolution as **parameters**, not literals —
      gated by the AC above
- [ ] `required_nodes` names all six external node types; verified against
      `/object_info` in a test
- [ ] The 4.2MP cap is **not** inherited as an H3 limit — resolution comes from the
      capability matrix, and the machine-specific cap is recorded as an operator
      preference at most
- [ ] Multi-reference role handling matches the shared reference request model
      (the sidecar's `ROLES` whitelist, `studio_stills.py:14`, and the per-role
      preprocessing at `:196-204` are the reference implementation)
- [ ] The `minimax-h3` **video** preset is not overloaded; the stills/video split is
      recorded in `epic-model-family-presets.md` terms
- [ ] If the six external nodes are unavailable in a plain ComfyUI, that is stated
      as a deployment prerequisite rather than worked around
- [ ] Test: template builds; substituted output passes `isValidWorkflow`
- [ ] **Provenance recorded.** Every sidecar-derived claim this ticket relies on is
      now **verified by source read** (2026-10-16,
      `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`): the reference
      chain shape and its node count — 16 fixed `add()` calls
      (`studio_stills.py:185,186-188,189,190,191,192,193-194,205,206,207,208,209,
      210,211,212`) plus 2 per reference (3 for `pose_layout`, `:196-204`), so 18
      nodes for one `identity` reference; the six external node-type names
      (`__init__.py:19-20`); the role whitelist `ROLES` (`studio_stills.py:14`,
      enforced `:143`) and the per-role preprocessing (`:196-204`); the
      `normalize()` literals being refused (`:118-137`, `:153`, `:157-158`,
      `:166-171`, with the Dareties hash constant at `studio_loras.py:11-12`); the
      4.2MP cap (`:120`). Still **not** verified, and to be recorded as such rather
      than as confirmed: (a) the six node names resolving in a live
      `/object_info`, (b) a graph from this template executing on real hardware,
      and (c) VRAM/latency at any resolution. For each, the ticket records the
      evidence — an executed test, an `/object_info` observation **with its date**,
      or a written answer from the upstream author — and a claim with no provenance
      is not used as if confirmed
- [ ] `bun run check` green
