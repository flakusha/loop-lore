# Research note — ComfyUI-DaSiWa-Nodes adoption for loop-lore video generation

**Lane:** `video-dasiwa` · **Date:** 2026-11-09
**Reviewed tree:** `../comfyui/custom_nodes/ComfyUI-DaSiWa-Nodes/` (read-only)
**Consumer surfaces reviewed:** `src/generation/video-engine.ts`,
`src/generation/video-gen-route.ts`, `src/generation/providers/comfyui*.ts`,
`src/generation/workflow-substitutor.ts`, `src/generation/workflow-loader/`,
`src/generation/comfyui-converter/`, `src/generation/workflow-library/`
**Scope note:** functionality review only — no `examples/` workflow JSONs opened,
no generated outputs enumerated.

---

## 1. Functionality inventory

### 1.1 Pack shape

| Surface | Content |
|---|---|
| `__init__.py` | 34 node classes in `NODE_CLASS_MAPPINGS` + 34 display names; registers server routes (`/dasiwa/version`, `/dasiwa/input-images`, `/dasiwa/ltx2/lorainfo`, `/dasiwa/ltx2/loraimg`, `/dasiwa/ltx2/keycounts`, `/dasiwa/system-monitor*`, `/dasiwa/wildcard-preset-prompt-builder/*`, `/dasiwa/refmods*`, `/dasiwa/h3/forge*`, `/dasiwa/llm/write`, `/dasiwa/enhanced-video-preview`, `/df_h3_continuity/*`) |
| `nodes/` | 44 modules incl. `h3_continuity/` (subpackage: assembly, core, segment_nodes, segment_store, transition, video_source, pyav_media, vendor/continuation_nodes) and `h3_forge.py` (Prompt Forge), `refmod_export.py`/`refmod_library.py`, `llm_backends.py`/`llm_runtime.py` |
| `js/` | 20 frontend modules (Director, Forge, continuity, tiled upscale, seed control, enhanced-video preview, refmod export, LLM writer, wildcard builder, system monitor, free-memory, about/version) |
| `docs/` | 23 per-node docs + `news_and_changelog.md` + `registry_security_review.md` |
| `tests/` | 60+ pytest modules + `.cjs` frontend tests + `fixtures/` |
| `tools/` | 7 verification scripts (registry audit, LLM test runner, frontend verifiers) |
| `data/` | `h3_forge.json` (182 KB), `wildcards_and_presets_dual.json` (243 KB), `llm_styles.json`, `llm_skills/*.md` (anima, wan, ltx, krea2, illustrious, yue2) |
| `pyproject.toml` / `requirements.txt` | identical dep list: torch, nvidia-vfx, Pillow, numpy, transformers>=4.45, accelerate, psutil>=5.9, av>=18.0, safetensors, nvidia-ml-py, amd-adlx (Win), llama-cpp-python>=0.3.26 |
| License | **GPL-3.0** (pack) |

### 1.2 Node classes by functional group

**Video production / H3 (the Director family)** — `MiniMaxH3Director`,
`MiniMaxH3DirectorGuide`: one-stop H3 pipeline (T2VA/I2VA/L2VA/FL2VA/REF2VA,
REF2VA = 9 images + 3 videos + 3 audio), RefMod persona packs, Prompt Forge
(LLM/VLM draft), Forge Cast/People boxes, Smart resolution, frame rate 0.1–240.

**Continuity (long-clip extension)** — `DaSiWaH3ContinuityAppend`,
`…Publish`, `…SegmentPrepare`, `…SegmentDecode`, `DaSiWaH3ClipAssemble`,
`DaSiWaH3TransitionGuide`, `DaSiWaH3TransitionRender`: extend a finished 24 fps
H3 take from a pinned latent checkpoint; segment-only decode for VRAM-bound
chains; join exported clips (lossless copy or re-encode) with optional
per-cut generated bridges.

**Post / output** — `DaSiWa_EnhancedVideoCombine` (IMAGE batch → mp4/webm/mkv/
AV1 + AAC/Opus mux, ping-pong, `save_first_frame`/`save_last_frame`,
`crop_to_audio`, metadata embedding), `DaSiWa_SeamlessLoop` (PSNR/SSIM-driven
overlap morph, RIFE/FILM/RTX interpolation), `DaSiWa_RTX_UpscalerRefiner`
(VSR/deblur/denoise, TrueHDR), `DaSiWa_RTX_FrameGeneration` (NVIDIA VFX
interpolation), `DaSiWaH3TiledUpscale` (latent upscale + per-step diffusion
refinement, spatial tiling + temporal chunking, Spike Guard), `MiniMaxH3Cache`
(approximate residual cache, model-scoped MODEL patch),
`DaSiWaTiledDiffusion` (image MODEL patch), `DaSiWa_Watermark`.

**Utility / IO** — `DaSiWa_ResolutionScaleCalculator` (constant-area sqrt
resolution), `DaSiWa_TorchResize`, `DaSiWa_NodeStatusSwitch` (mute/bypass any
node), `DaSiWa_SeedControl` (64-bit seed + NOISE output, external-seed socket),
`DaSiWa_MetadataImageSaver`/`Full`/`DaSiWa_MetadataConfig`/
`DaSiWa_CreateExtraMetadata` (A1111-style embedded metadata, LoRA hashes),
`DaSiWa_LTX2LoraLoader` (10-slot LoRA stacker, LTX-2.3 audio separation),
`DaSiWa_InpaintCropPrep`/`InpaintComposite`, `DaSiWa_RandomStringPicker`,
`DaSiWa_WildcardPresetPromptBuilder` (+ HTTP `/build`),
`DaSiWa_LLMPromptWriter`/`LLMModelSelector`/`LLMAnalyze` (+ HTTP
`/dasiwa/llm/write`), `DaSiWaH3RefModExport`.

---

## 2. Adoption candidates (node → loop-lore gap it fills)

| # | DaSiWa node / API | What it provides | loop-lore gap it fills | Verdict |
|---|---|---|---|---|
| 1 | `DaSiWa_EnhancedVideoCombine` | IMAGE batch → encoded mp4/webm/mkv, optional AUDIO mux, metadata embedding | **Sink classification already works**: the pack files the container under the `gifs` bucket (`nodes_enhanced_video_combine.py:600`) and loop-lore's poll table already maps `gifs`→`video` (`comfyui-poll.ts:19`), so `video-engine.ts:139`'s `kind === "video"` find hits it. **The real gap is the Animated WebP/AVIF container choice**: for those the same asset is filed under `images` (`:598`), so loop-lore finds no video sink and returns 503 "no video output" although a playable clip exists. The node also emits per-frame PNGs under `images` (`:592-594`) and optional first/last-frame PNGs, so an `images`-bucket fallback needs a format/mime filter, not "first image". | **Adopt** — highest value, lowest cost (sink-selection policy, not node code) |
| 2 | `MiniMaxH3Director` + `MiniMaxH3DirectorGuide` | The Director tier (epic's "first-class default tier", operator decision 2026-10-29) | `TASK-video-provider-minimax-h3` and the epic's Director-tier rows are unfilled; `packages/core/src/config/schema/providers.ts:128` `VideoProviderConfig.workflow` points at an operator-authored `configs/workflows/*.json` — the Director graph is exactly such a workflow | **Adopt** as a workflow-library row, not as code |
| 3 | `DaSiWaH3Continuity*` + `DaSiWaH3ClipAssemble` + `DaSiWaH3Transition*` | Extend / segment / join clips into one long take | `video-gen-route.ts` persists exactly **one** clip per request (`persisted[0].asset`); loop-lore has no notion of clip extension, segmentation, or multi-clip assembly. The pack's own HTTP surface (`/df_h3_continuity/*`) is a candidate server-side seam | **Adopt later** — needs a multi-clip asset model first |
| 4 | `DaSiWa_SeamlessLoop`, `DaSiWa_RTX_FrameGeneration`, `DaSiWaH3TiledUpscale` | Interpolation / upscale / refinement as *workflow stages* | Epic Phase B "post-stage workflow rows (interpolation, upscale, …)" — toggleable, license-fenced. All three are pure ComfyUI graph nodes, so each is a **workflow-library row** with `min_vram` + license fence, exactly as the epic prescribes. No loop-lore code change needed beyond rows | **Adopt as rows** |
| 5 | `DaSiWa_SeedControl` | 64-bit seed (H3 space) + `NOISE` output + external-seed socket | loop-lore's substitutor emits `seed` as a 31-bit `Math.random()` int (`workflow-substitutor.ts:210`); H3 needs the full unsigned 64-bit range. `DaSiWa_SeedControl` already has an **external seed socket**, so loop-lore's `{{seed}}` can drive it if the substitutor widens the range | **Adopt** — small substitutor change |
| 6 | `DaSiWa_WildcardPresetPromptBuilder` (+ `/build` route) + `DaSiWa_LLMPromptWriter` (+ `/dasiwa/llm/write`) | Deterministic prompt variants per model family; LLM prompt rewriting with vision | `TASK-video-template-schema` (video prompt templates, per-family formats) is Not Started. The pack's `data/llm_skills/*.md` (wan, ltx, krea2, illustrious, anima, yue2) and `/dasiwa/llm/write` are an already-written answer to the same question | **Defer** — loop-lore owns its own prompt templates; adopt only if the schema ticket stalls |
| 7 | `DaSiWa_MetadataImageSaver` + `DaSiWa_CreateExtraMetadata` | A1111-style embedded metadata + LoRA hashes + custom keys | loop-lore's video asset metadata extraction is still open (`TASK-ivss-video-metadata-extractor`); the pack embeds the *generation provenance* into the file, complementing (not replacing) loop-lore's own extractor | **Adopt partially** — provenance only |

**Explicitly not adoption candidates:** `DaSiWa_NodeStatusSwitch` (ComfyUI-side
bypass UI; loop-lore has its own graph-level `enabled`/`muted` handling),
`DaSiWa_SystemMonitor` (ComfyUI telemetry), `DaSiWa_RandomStringPicker`,
`DaSiWa_Lable`, the JS front-end modules (loop-lore's UI is htmx + Alpine), and
`h3_forge`/RefMod authoring surfaces (operator-side authoring tools, not a
runtime API).

---

## 3. Fork recommendation

**Recommendation: SOFT fork (patchset), not a hard fork.** Consistent with the
parent `../comfyui` precedent.

Justification (one line each):

- **The parent already soft-forks this exact pack** — `custom_nodes.manifest.toml`
  pins `ComfyUI-DaSiWa-Nodes` at `ref = "main"` with
  `patches = ["0001-continuity-analyze-cancel-on-client-disconnect.patch"]`;
  the patch lives in `custom_nodes_patches/ComfyUI-DaSiWa-Nodes/` and is applied
  by `scripts/custom_nodes_deps.py` (`apply_patches`, `git apply` not `am`,
  with a `patches_base` stamp for traceability). 21 patch files across 7 packs
  follow the same shape.
- **loop-lore needs no Python code from the pack.** Every adoption candidate is
  either a *workflow row* (graph JSON the operator authors) or a small TS-side
  change (sink selection, seed width). Nothing in `nodes/*.py` needs to be
  vendored into the TypeScript repo — a hard fork would copy ~44 GPL-3.0 modules
  into an LGPL-3.0-or-later project for zero functional gain and a licensing
  obligation.
- **The pack moves fast** (0.5.40; changelog covers 2026-07-05 → 2026-11-08).
  A vendored hard fork rots; a pinned-ref + patchstack tracks upstream for free
  and local fixes stay small diffs.
- **A hard fork would break the converter's provenance discipline.** The repo's
  fixture README (`src/generation/comfyui-converter/fixtures/README.md`) forbids
  pasting pack source into `src/`; a vendored copy invites exactly that.

**Concretely, in loop-lore:** adopt by *consuming* the pack through the existing
ComfyUI provider seam — add workflow-library rows whose `requiredNodes` name
DaSiWa classes (the converter's `UNREFERENCED_LIVE_CLASSES` already lists
`DaSiWa_NodeStatusSwitch` and `DaSiWaH3ContinuityPublish`), keep the pack
installed on the ComfyUI host under the parent repo's manifest/patch mechanism,
and land any needed pack fix as a patch file in
`custom_nodes_patches/ComfyUI-DaSiWa-Nodes/` on the **comfyui** side — not as a
loop-lore code change.

---

## 4. Parent soft-fork mechanism (confirmed, shallow)

`../comfyui` is a fork of `Comfy-Org/ComfyUI` (`origin` = `flakusha/comfyui`,
`upstream` = `Comfy-Org/ComfyUI`) that keeps its local changes as **plain
`git format-diff` patches applied on top of a pinned ref**, not as commits
inside the vendored node checkouts:

| Piece | Location | Role |
|---|---|---|
| Declarative pin table | `custom_nodes.manifest.toml` | one `[nodes.<dir>]` table per custom node: `url`, `ref`, optional `extras`, optional ordered `patches`, optional `patches_base` |
| Patch stacks | `custom_nodes_patches/<node>/NNNN-*.patch` | 21 tracked patches across 7 packs; DaSiWa carries one |
| Tooling | `scripts/custom_nodes_deps.py` (`sync`, `apply_patches`, `_patch_files`) | clones/pins the ref, applies the stack with `git apply` (not `am`), refuses a dirty worktree, re-applies idempotently via a reverse-apply check, stamps `patches_base` |
| Driver | `scripts/update_local.py` (step 5 runs sync + dependency install) | the operator's one-shot local setup |

Header docs live in the manifest itself (lines 1–75) — the repo has no
`docs/` directory.

---

## 5. Open questions

1. **Which DaSiWa classes are actually installed on the target ComfyUI host?**
   `requiredNodes` on a workflow row must be a subset of the live
   `/object_info`; the pack version is pinned on the host, not by loop-lore.
2. **Does the Director graph survive loop-lore's `findDeadNodes` strict ingest?**
   The Director export is a large graph with control nodes; the converter
   already special-cases `DaSiWa_NodeStatusSwitch` and
   `DaSiWaH3ContinuityPublish` as unreferenced-but-live, but the strict
   workflow-loader path (`loader.ts:172`) is a *different* validator than the
   converter — needs a probe.
3. **Video sink selection policy.** `video-engine.ts:139` picks the first
   `kind === "video"` file. With DaSiWa's combine node, one graph yields the
   container (bucket `gifs`) plus optional frame PNGs (bucket `images`) and
   optional first/last-frame PNGs. Policy needed: prefer the container; when
   several video containers exist (e.g. Animated WebP + MP4), pick by
   mime/format rather than order.
4. **Seed width.** `{{seed}}` must widen past 31 bits for H3's 64-bit space;
   `DaSiWa_SeedControl`'s external socket is the intended injection point, but
   the Director's own seed widget is a JSON blob (`seed_control_state`) —
   substituting a bare integer into it is not the same contract.
5. **Audio mux vs separate audio asset.** `EnhancedVideoCombine` can mux AUDIO
   into the video; loop-lore's asset model is polymorphic and already supports
   separate `assetType: "audio"`. Which one is the default for H3 native-audio
   tiers?
6. **Continuity requires a multi-clip asset model** (clip identity, ordering,
   provenance) before the extension tier can land — bigger than the node work.
7. **License fence wording for rows.** The pack is GPL-3.0; the epic records
   MiniMax H3 community-license terms as "informational fence metadata on the
   workflow row". Confirm whether a GPL-3.0 *node pack* (as opposed to model
   weights) needs the same fence treatment.

---

## 6. Verification performed

Commands run (read-only, from the dev checkout / worktree):

- `bun node_modules/giwt/src/cli.ts list` → worktree `video-dasiwa-review`
  created at `tree/video-dasiwa-review`, branch off `dev` @ `9c7a71aa`.
- `git status --short` (dev, read-only) → pre-existing dirt present, **not
  touched** by this lane (`.plan/epics/epic-*`, `.plan/tickets/TASK-*`,
  `src/generation/video-gen-route.ts`, `src/generation/video-gen-route.test.ts`,
  `src/routes/templates/modality.ts`, untracked `src/generation/video-jobs.ts`,
  `src/integrations/harness/acp-authorization.test.ts`,
  `src/integrations/loop-lore-facade/mcp/scoped-agent.test.ts`).
- `git ls-files custom_nodes_patches` (comfyui) → 21 tracked patch files across
  7 packs, incl. `custom_nodes_patches/ComfyUI-DaSiWa-Nodes/0001-continuity-analyze-cancel-on-client-disconnect.patch`.
- `grep '^\s+"[A-Za-z0-9_]+":' __init__.py` → 34 node-class mappings (lines
  41–74) and 34 display names (lines 79–112).
- Direct reads of `nodes/nodes_enhanced_video_combine.py:591-601` (the
  `gifs`-bucket video emission), `nodes/nodes_seed_control.py` (64-bit seed +
  external socket), `nodes/nodes_seamless_loop.py:171-176`,
  `nodes/nodes_minimax_h3_tiled_upscale.py:197-257`,
  `nodes/h3_continuity/{assembly,segment_nodes,transition,core}.py`.
- Parent soft-fork mechanism read from `custom_nodes.manifest.toml` (header
  lines 1–84) and `scripts/custom_nodes_deps.py` (`apply_patches` ~:788,
  `PATCHES_DIR` ~:731).

No builds, tests, or gates were run: this lane produced a research note only
(no `src/` change), so there is no code to verify.
