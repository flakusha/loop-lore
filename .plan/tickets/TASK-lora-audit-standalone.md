<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Standalone LoRA audit (no ComfyUI process required)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-reference-conditioned-generation`
**Related:** `epic-lora-discovery-application.md`, `TASK-lora-discovery-application.md`, `TASK-comfyui-first-class-lora-stacks.md`, `TASK-sidecar-de-hardcoding-cross-platform-installer.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

A LoRA audit that runs with ComfyUI stopped: header validation, checksum, tensor
shape compatibility against a base checkpoint, and a machine-readable verdict.

## Context

Source artifact: `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/studio_loras.py`
— **scratch, will be pruned.** Read 2026-10-16.

The audit logic is real and the *transport* around it is wrong:

- Safetensors header parse: 8-byte length prefix, sanity caps (>64 MiB or > size-8
  rejected), `.safetensors` suffix enforced, LRU-cached on
  `(path, size, mtime_ns)` (`:21-34`)
- SHA-256 streamed in 8 MiB blocks, same cache key (`:37-47`)
- `compatibility(name, header)` → `('both','accelerator')` for the expected basename,
  else `('incompatible','unknown')` (`:50-53`)
- `audit_patch(base_header, lora_header)` (`:56-79`) builds
  `diffusion_model.<root>` / `lora_unet_<root>` aliases from base `.weight` shapes

**What is broken:** discovery goes through `folder_paths.get_full_path(kind, name)`
(`:15-18`) and the module as a whole imports `comfy_execution.progress`,
`PromptServer`, and `nodes.NODE_CLASS_MAPPINGS`. **A running ComfyUI is mandatory.**
Auditing a file cannot require the thing that serves the file.

**What is wrong beyond portability:** `compatibility` is a basename string match
against one artifact (`:50-53`), and `normalize` then requires the SHA-256 to
equal a hardcoded constant (`studio_stills.py:170-171`, constant at
`studio_loras.py:11-12`). That is a pin on one author's file, not a compatibility
check. The shape audit underneath it — do this LoRA's tensor names exist in this
base model — is the part that generalizes.

Two conflicts to resolve rather than duplicate:

1. `epic-lora-discovery-application.md` and `TASK-lora-discovery-application.md`
   already own LoRA **discovery** (finding files and listing them). This ticket
   assumes discovery exists and adds **validation**.
2. `TASK-comfyui-first-class-lora-stacks.md` owns applying a LoRA stack to a
   workflow. Applying a bad LoRA is what this ticket exists to prevent — read it
   so the verdict shape is consumable there.

Both `buildLoraNodes` (`src/image-edit/templates/builtin/lora.ts:37-54`) and
`injectComfyUILora` (`src/generation/lora/discovery-comfyui.ts:171-212`) inject
without asking whether the LoRA is compatible at all. The verdict this ticket
produces is the missing input to both.

Their node-id bugs are fixed — `buildLoraNodes` takes a required `reserved` set and
`injectComfyUILora` uses the shared `allocateNodeId`
(`src/generation/node-id.ts:20`) — so do not cite
`epic-comfyui-first-class-citizen.md`'s Defect 2 / Defect 4 as open. Compatibility
is the remaining gap, not id allocation.

## Acceptance Criteria

- [ ] Audit runs against a filesystem path with **no ComfyUI process, no HTTP, and
      no `folder_paths` import**; verified by running it with ComfyUI stopped
- [ ] Header parse, `.safetensors` suffix check, and the size sanity caps are ported,
      with the same cache key `(path, size, mtime_ns)` so a touched-but-unchanged file
      does not re-hash
- [ ] SHA-256 is computed by streaming with a bounded block size; a truncated or
      over-long length prefix is rejected rather than trusted
- [ ] Shape audit reports which tensors in the LoRA have **no counterpart** in the
      base checkpoint, by name — that list is the verdict, not a boolean
- [ ] Verdict is machine-readable and consumable by the LoRA injection paths; it
      names the mismatch rather than returning "incompatible"
- [ ] A LoRA that fails the audit is **not** silently skipped. `injectComfyUILora`
      currently warns-and-skips when a LoRA is not found
      (`src/generation/image-engine/comfyui.ts:70-75`); the chosen behaviour for an
      incompatible-but-present LoRA is decided and recorded — fail loudly is the
      default
- [ ] Test: a LoRA with an extra unmatched tensor reports that tensor by name; a
      clean LoRA audits clean; a corrupt header is rejected without throwing
- [ ] `bun run check` green
