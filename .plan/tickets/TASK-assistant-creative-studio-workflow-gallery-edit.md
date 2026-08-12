# TASK: Assistant Creative Studio — Gallery Edit Workflows

**Status:** 📝 Draft
**Priority:** High (post-Gate C, with parent epic)
**Effort:** Large
**Epic:** `epic-assistant-creative-studio-workflows` (§7.8)
**Depends on:** `epic-assistant-creative-studio-workflows` (runner/loader),
existing `src/image-edit/` subsystem (already implemented),
`epic-comfyui-plugin.md` (ComfyUI dispatch target),
`epic-assistant-generation-extensions.md` (sd-server provider)

## Summary

Implement **gallery → edit workflows** as a **separate implementation scope** from
entity generation (§7.6) and batch ops (§7.7). This wraps the **already implemented**
`src/image-edit/` subsystem (`index.ts`, `template-registry.ts`, `routes.ts`,
`providers/{comfyui, sd-server}`, `templates/builtin/{txt2img, img2img, inpaint,
controlnet, upscale, lora}.ts`) with the same prompt-preview + validation +
confirmation gating pattern that §7.6 applies to `/create`. Do **not** re-implement
image editing — dispatch to `src/image-edit/routes.ts handleRun`.

## Design (from epic §7.8)

- **Asset → edit workflow binding** — open an asset, choose "Edit" → edit workflow
  keyed by asset type: image → `img2img` / `inpaint` / `controlnet` / `upscale` /
  `lora`; video → video-to-video (Minimax H3 / Wan / LTX if edit-capable).
- **Edit-capable model families** (extend §7.1b):
  - `flux-kontext` — instruction edit ("change X to Y"), no init-image weighting.
  - `qwen-edit` — **dual mode** `t2i` (generation) + `i2i` (edit); workflow selects
    mode at dispatch (see §7.1b preset `modes: [t2i, i2i]`).
  - SD-server / ComfyUI builtins `img2img`, `inpaint`, `controlnet`, `upscale`,
    `lora` — `backend: comfyui | sd-server`, chosen by `required_nodes`.
  - `sdxl` (+variants) edit via `img2img`/`inpaint` + ControlNet/LoRA **parameter
    add-ons** (not distinct families).
  - **Needs research (flagged `?` in request):** `klein` — absent from §7.1b presets;
    confirm whether it is an edit-capable backend or a naming variant before adding a
    preset. `minimax-h3` is a **video** family (§7.1b); video edit = video-to-video —
    confirm img2img-style edit support before claiming image-edit parity.
- **ControlNet / LoRA** — modeled as **template parameters** inside `img2img`/`inpaint`
  (OpenPose/Depth/Canny preprocessors, LoRA stack), not separate workflows. Builtin
  `controlnet.ts` + `lora.ts` templates already define these.
- **Workflow shape** — pick template (img2img/inpaint/controlnet/upscale/lora), bind
  source asset as `input_image`, collect prompt + template params (denoise, controlnet
  weights, lora weights), preview, confirm, dispatch to `POST /api/image-edit/run`;
  result adds a new gallery asset (or replaces, per policy).
- **Quality gates** — `schema` (valid `input_image` + prompt), `consistency` (asset
  within world scope / ownership), `duplicate` (same source + params → warn), NSFW
  policy reuse.
- **Dispatch separation** — edit workflows set `backend: image_edit` →
  `src/image-edit/routes.ts handleRun`, **not** the generation pipeline. This is the
  key boundary vs §7.1 generation workflows.

## Acceptance Criteria

- [ ] `configs/templates/workflows/gallery-edit.yaml` defines edit workflows per
  template (img2img/inpaint/controlnet/upscale/lora) with `backend: image_edit`.
- [ ] Gallery "Edit" action opens the workflow, binds the source asset as `input_image`,
  and previews steps + recommendations.
- [ ] `qwen-edit` usable in **both** `t2i` (generation) and `i2i` (edit) modes from the
  workflow; §7.1b preset carries `modes: [t2i, i2i]`.
- [ ] ControlNet / LoRA exposed as parameters on img2img/inpaint (not separate
  workflows).
- [ ] Runner validates steps, requires confirmation, dispatches to
  `POST /api/image-edit/run` (routes to `src/image-edit` providers, not generation).
- [ ] Result asset added to gallery with correct world scope / ownership.
- [ ] NSFW policy + ownership gates applied pre-dispatch.
- [ ] `klein` / `minimax-h3` edit support resolved (research note) before presets added.
- [ ] Unit test: asset→template binding + dispatch routing to image-edit; integration:
  edit an image asset end-to-end via the workflow.

## Files

| File                                                | Action |
| --------------------------------------------------- | ------ |
| `configs/templates/workflows/gallery-edit.yaml`     | new    |
| `src/assistant/workflows/gallery-edit.ts`           | new (edit workflow UX over src/image-edit) |
| `configs/templates/workflows/model-families.yaml`   | modify (qwen-edit `modes`, edit-capable entries) |
| `src/image-edit/routes.ts`                          | reuse (handleRun dispatch target) |
| `src/image-edit/templates/builtin/*`                | reuse (img2img/inpaint/controlnet/upscale/lora) |
| `src/assistant/workflow-runner.ts`                  | reuse  |

## Related

- `epic-assistant-creative-studio-workflows.md` §7.8 (§7.1b for families)
- `src/image-edit/` (existing subsystem — wrap, do not re-implement)
- `epic-comfyui-plugin.md` (ComfyUI dispatch target)
- `epic-assistant-generation-extensions.md` (sd-server provider)
- `TASK-assistant-creative-studio-workflow-gallery-batch.md` (separate scope)
- `TASK-assistant-creative-studio-workflows.md` (parent task)
