<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Render image-edit parameter forms from TemplateParameter[]

**Effort:** Medium
**Summary:** `TemplateParamType` already declares seven param types. Nothing in the codebase renders a form from them. This is the largest unbudgeted UI cost in the epic.
**Context:** Found by investigation 2026-09-27 (`docs/meta/research/comfyui-first-class-investigation.md` §3.3). Chat workflow selection is useless without it.
**Acceptance Criteria:** One Alpine component builds a form from a `parameters[]` array; all seven declared types render.

**Priority:** P2 — Medium
**Status:** Not Started
**Epic:** epic-comfyui-first-class-citizen
**Depends on:** none (rendering is independent of the server-side validation ticket)

## Description

`TemplateParamType` (`src/image-edit/types.ts:30-36`) already declares:

```typescript
export type TemplateParamType =
  | "string" | "number" | "boolean" | "select"
  | "image" | "lora";
```

Six/seven distinct input shapes, each needing different markup, a label, a
`min`/`max`/`step` binding for numbers, an options list for `select`, an upload
target for `image`, and a LoRA picker for `lora`.

**There is no renderer for any of them anywhere in the codebase.** The existing
`admin-templates` UI (`src/frontend/alpine/admin-templates/{profiles,editing}.ts`)
edits a single `templateBody` text field — it does not consume `parameters` at all.

This was folded implicitly into the admin-workflow ticket when the epic was
written. It is real, separable work and is called out here so it is not
discovered mid-implementation.

## Acceptance Criteria

- [ ] One Alpine component (`x-data`) builds a form from a `parameters[]` array.
      Do not build one per type.
- [ ] All declared types render: `string` (text input), `number` (`min`/`max`/`step`
      bound from the parameter metadata), `boolean` (checkbox), `select` (options
      list), `image` (upload + preview), `lora` (picker).
- [ ] Client-side bounds mirror the server-side validation in
      `TASK-comfyui-template-parameter-validation`. Client bounds are UX, not
      security — the server remains the enforcement point. Say so in a comment so a
      future reader does not treat the HTML attributes as the guarantee.
- [ ] `required` params are marked and the submit button reflects an incomplete
      form.
- [ ] The `lora` picker reads the discovered LoRA list (existing LoRA discovery
      cache) rather than a hardcoded array.
- [ ] The `image` param reuses the existing upload path — there is already an
      `uploadImageToComfy` flow (`src/generation/providers/comfyui-upload.ts`) and
      an admin upload handler. Do not build a second one.
- [ ] The form resets cleanly when the user switches workflows mid-edit — stale
      params from the previous workflow must not be submitted.
- [ ] Works in both the chat selection surface and the admin editor; a second
      consumer must not require a second renderer.

## Technical Notes

- Keep it an Alpine component like the rest of `src/frontend/alpine/`. No build
  step, no framework, consistent with the repo's frontend constraints.
- The `select` options for sampler/scheduler come from runtime discovery — see
  `TASK-comfyui-sampler-scheduler-discovery`. For params whose options are not
  yet discovered, render the param but disable it with a clear reason rather than
  showing a hardcoded list that may be wrong.
- This ticket depends on neither the storage decision nor the validation ticket,
  but it is *useless* without both — a form that posts a body nothing validates and
  nothing routes is a mock. Sequence it last among the chat-selection work.


git issue: 9d82194
