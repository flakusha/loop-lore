<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Image-edit ComfyUI provider never uploads input_image

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-comfyui-plugin
**Caveats:** TOCTOU: the uploaded file must exist on the ComfyUI side before the workflow is submitted. Security: the uploaded bytes are user content — the upload must not leak a local filesystem path into the workflow. Authorization: the image-edit route's existing authz applies unchanged. Parallelism: two concurrent runs uploading the same source image get distinct ComfyUI names. Lock/unlock lifecycle: none. Partial failure: an upload failure aborts the run BEFORE the workflow is submitted, so no dangling filename is ever queued. Rollback: the provider can fall back to the current pass-through behaviour. Stale state: none — the uploaded name lives only for the run. Data races: none. Idempotency: re-running uploads again (no cache). Observability: the run logs the uploaded ComfyUI filename.

**Summary:**

The image-edit ComfyUI provider builds the template and submits the workflow, but input_image is a plain string param passed verbatim into a ComfyUI LoadImage node, so ComfyUI receives a filename it never got. The only uploader in the tree is the matting path.

**Context:**

`src/image-edit/providers/comfyui-provider.ts:145-149` builds the template and
submits the workflow, but `input_image` is a plain string param passed verbatim
into a ComfyUI `LoadImage` node
(`src/image-edit/templates/builtin/_helpers.ts:143-156`,
`src/image-edit/templates/builtin/img2img.ts:24,42`).

The only uploader in the tree is the matting path
(`src/generation/providers/comfyui.ts:351-353` →
`src/generation/matting/comfy-provider.ts:111-114`), so ComfyUI receives a
filename it never got — the `LoadImage` node fails at execution time with an
opaque error, long after the provider reported success.

The uploader already exists and is reusable:
`uploadImageToComfy` (`src/generation/providers/comfyui-upload.ts:21-48`)
POSTs bytes to `/upload/image` and returns the stored name.

This is one of the two independent defects that block the img2img rung (the
other is the workflow-library row's unresolved placeholders). The epic
attributed the blockage only to `epic-comfyui-plugin`'s open prerequisites.

Alternative considered: keep the provider dumb and upload in the route layer.
Rejected — the route hands the provider a local path, and the upload is a
ComfyUI-protocol concern; the provider owns the protocol.

**Acceptance Criteria:**

- [ ] An img2img (or inpaint) image-edit run uploads the source image to
      ComfyUI and substitutes the returned filename into the `LoadImage` node.
- [ ] The upload happens before the workflow is submitted; an upload failure
      fails the run with a clear error instead of submitting a dangling
      filename.
- [ ] A test asserts the workflow submitted to ComfyUI carries the uploaded
      filename (and that the local path does not leak into it).
- [ ] Tests passing; `bun run typecheck` and `bun run lint` clean.
