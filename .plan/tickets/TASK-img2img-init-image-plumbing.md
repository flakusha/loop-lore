<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: img2img init-image plumbing (prerequisite for the edit rung)

**Status:** Blocked
**Priority:** critical
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** **Blocked on `epic-comfyui-plugin` open prerequisites** — do not start until those land. Security: the init image is an asset uploaded to the ComfyUI host at `/upload/image`; it must be the actor's own base avatar, never an arbitrary path, and the stored filename must not be caller-controlled. Authorization: the referenced asset must belong to the actor. Partial failure: an upload failure must fail the generation, not silently fall back to txt2img without recording that it did. Rollback: the field is optional; omitting it restores today's behaviour exactly. Stale state: a deleted base asset must fail cleanly. Idempotency: the same asset uploaded with the same filename overwrites (the upload helper sets `overwrite: "true"`) — deterministic. Observability: log whether the edit rung ran. Resource: uploaded images accumulate in the ComfyUI input directory; nothing prunes them.

**Summary:**

Add an init-image / reference-image field to `ImageGenOptions` and wire it to the
already-shipped `configs/workflows/img2img.json`. This is the **prerequisite**
for the `edit` rung of the strategy selector — without it, "edit is selected"
has nothing to mean.

**Context:**

**Confirmed by reading the code, in four places:**

1. `ImageGenOptions` (`src/generation/image-engine/types.ts:6-25`) has `prompt`,
   `n`, `size`, `outputFormat`, `steps`, `cfgScale`, `samplerName`,
   `negativePrompt`, `seed`, `enableHr`, `hrScale`, `denoisingStrength`,
   `workflow`, and `lora`. **There is no init-image or reference-image field.**
2. `generateComfyUI` (`src/generation/image-engine/comfyui.ts:44-53`)
   substitutes exactly eight values into the workflow: `prompt`,
   `negativePrompt`, `width`, `height`, `steps`, `cfgScale`, `sampler`, `seed`.
   **No `LoadImage` input is ever produced.** `opts.workflow` already exists
   (`types.ts:22`, defaulting to `"txt2img"` at `comfyui.ts:38`), so the
   workflow selection half of img2img is already wired.
3. **The workflow template already exists and already expects an input image.**
   `configs/workflows/img2img.json:25-31` defines a `LoadImage` node whose
   `image` input is `"{{input_image}}"`, feeding `VAEEncode` at `:32-39` and
   the KSampler at `:40-48`.
4. **The upload helper already exists.**
   `src/generation/providers/comfyui-upload.ts:21-48` POSTs multipart bytes to
   `{baseUrl}/upload/image` with `overwrite: "true"` and returns the stored
   filename — exactly what a `LoadImage` node needs.
   `ComfyUIClient.uploadImage` wraps it at
   `src/generation/providers/comfyui.ts:351-353`, and it has a production
   caller: the ComfyUI matting provider at
   `src/generation/matting/comfy-provider.ts:111-114`.

So the missing work is genuinely small: **one field on `ImageGenOptions`, one
branch in `generateComfyUI` that uploads the asset and passes its stored filename
as `input_image`.** What makes this a prerequisite rather than a convenience is
that nothing else in the generation path can supply an edit reference.

**A separate live subsystem exists and is not the answer.**
`src/image-edit/` is mounted at `POST /api/v1/image-edit/run`
(`src/image-edit/routes.ts:64-74`) with its own `img2img` template
(`src/image-edit/templates/builtin/img2img.ts`) accepting an uploaded
`input_image` parameter. It is a distinct job/asset-ownership path, it is not
reachable from `generateImages`, and it shares none of the emotion-avatar
plumbing. Wiring it would mean two generation subsystems rather than one — see
the epic's Rejected Alternatives.

**Why this is Blocked.** `epic-comfyui-plugin` is `Status: In Progress` with
open first-class-citizen gaps. Its Path A pattern is the one this ticket uses
(`epic-comfyui-plugin.md:44-49`: workflow JSON in `configs/workflows/`, consumed
by `generateComfyUI` with no API-call change), and that pattern's known defects
— numeric `{{var}}` substitution, node-id allocation, and template parameter
validation — are named as still-open prerequisites by
`.plan/epics/epic-sam3-segmentation-integration.md:50-55`, which needs the same
three before its graphs are safe. Land them first; this ticket then inherits a
validated substitution path instead of being the first consumer to find its
edges.

**Acceptance Criteria:**

- [ ] `ImageGenOptions` (`src/generation/image-engine/types.ts:6-25`) gains an
      optional init-image field carrying the reference asset, typed and
      documented as ComfyUI-path-only
- [ ] `generateComfyUI` (`src/generation/image-engine/comfyui.ts:44-53`) uploads
      the referenced asset via `uploadImageToComfy`
      (`src/generation/providers/comfyui-upload.ts:21-48`) and passes the
      returned filename as the `input_image` substitution variable
- [ ] The upload branch runs only when an init image is present; omitting the
      field produces today's workflow byte-for-byte
- [ ] Selecting `workflow: "img2img"` without an init image fails with a clear
      error rather than submitting a workflow whose `LoadImage` node has an
      empty filename
- [ ] The referenced asset is verified to belong to the actor before upload; a
      caller cannot supply an arbitrary filename or path
- [ ] An upload failure surfaces as a generation failure, and the outcome
      records that the edit rung did not run
- [ ] `denoisingStrength` (`types.ts:20`) is passed through for the img2img
      path — `configs/workflows/img2img.json:47` already substitutes
      `{{denoise_strength}}`
- [ ] Unit tests cover: init image present (upload called, `input_image` set),
      absent (upload not called), upload failure, and img2img workflow selected
      without an init image
- [ ] Tests pass; `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- No init-image field: `src/generation/image-engine/types.ts:6-25`
- Eight substituted values, no `LoadImage`:
  `src/generation/image-engine/comfyui.ts:44-53`
- `workflow` option already exists and defaults to `txt2img`:
  `src/generation/image-engine/types.ts:22`; `src/generation/image-engine/comfyui.ts:38`
- The existing template: `configs/workflows/img2img.json:25-31` (`LoadImage` →
  `{{input_image}}`), `:32-39` (`VAEEncode`), `:40-55` (KSampler, including
  `{{denoise_strength}}` at `:47`)
- The existing upload helper: `src/generation/providers/comfyui-upload.ts:21-48`
- Its client wrapper: `src/generation/providers/comfyui.ts:351-353`
- Its one production caller (proves the path works):
  `src/generation/matting/comfy-provider.ts:111-114`
- Substitution semantics — a whole-string placeholder yields the variable's own
  type; an unknown variable becomes the empty string:
  `src/generation/workflow-substitutor.ts:128-143`; extra params are
  passed through at `:213-218`
- Loader params type already allows extra keys:
  `src/generation/workflow-loader/convenience.ts:22-38`
- The separate, unwired subsystem: `src/image-edit/routes.ts:64-74`,
  `src/image-edit/templates/builtin/img2img.ts:14-60`
- The blocking epic and its open gaps: `epic-comfyui-plugin.md:9-10`
  (`Status: In Progress`; the `handleRun` auth gap and the `client_id` gap),
  Path A contract at `:44-49`
- The same three prerequisites named for SAM3:
  `.plan/epics/epic-sam3-segmentation-integration.md:50-55`