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

A **generic standalone LoRA audit** — no ComfyUI process, no HTTP, no
`folder_paths`: safetensors header parse, SHA-256, and tensor-shape / compatibility
audit against a base checkpoint, returning a machine-readable verdict.

Its purpose is **loop-lore's own LoRA discovery** (`src/generation/lora/` —
`discovery.ts`, `discovery-comfyui.ts`, `discovery-http.ts`,
`discovery-sdserver.ts`), not the Python sidecar: `studio_loras.py` is the
reference implementation for the parsing rules, nothing more. The sidecar's
custom-node and portability work is a separate concern (see
`TASK-sidecar-de-hardcoding-cross-platform-installer.md`).

## Context

Source artifact: a Python ComfyUI HTTP-route extension (its `studio_loras.py`, 79
lines), handed over **2026-09-30** by an external acquaintance of the repo owner and
vendored **only** under `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`.
That directory is scratch, gitignored, and was **never committed**. It was pruned
before implementation — which is why this ticket was first written with its
sidecar-derived claims unverified — and it **has since been re-acquired and was
functionally reviewed on 2026-10-16 by reading the on-disk source.** It is a
**review-only reference artifact**: never committed, `.tmp/` only, never an import
target, and nothing in `src/` may reference it.

Every line number and import claim below is verified against that read. The claim
about which ComfyUI modules the module imports is exactly the kind of detail a
single read gets wrong — it was wrong, and is corrected below. What still needs a
live ComfyUI **and** a real LoRA file is confirming the audit's verdicts against a
real model/LoRA pair; the last AC records it.

The audit logic is real and the *transport* around it is wrong:

- Safetensors header parse: 8-byte little-endian length prefix, sanity caps
  (count > 64 MiB or count > size-8 rejected), `.safetensors` suffix enforced,
  LRU-cached on `(path, size, mtime_ns)` (`:21-34`)
- SHA-256 streamed in 8 MiB blocks (`:41`), same cache key and `maxsize=2` LRU
  (`:37-47`)
- `compatibility(name, header)` → `('both','accelerator')` for the expected basename,
  else `('incompatible','unknown')` (`:50-53`)
- `audit_patch(base_header, lora_header)` (`:56-79`) builds
  `diffusion_model.<root>` / `lora_unet_<root>` aliases from base `.weight` shapes
  and returns `{'matched_patches', 'unmatched_patches', 'unrecognized_tensor_keys'}`
  (`:79`); it **raises** rather than reporting on shape mismatch, zero matches, or
  any unmatched/unsupported keys (`:76-78`) — the TS port must turn those raises
  into the verdict list this ticket asks for

**What is broken — and narrowed.** Discovery goes through
`folder_paths.get_full_path(kind, name)` (`:15-18`), raising
`'Installed model file missing: …'` when the path is absent or not a file (`:17`).
The module's **entire** non-stdlib import is `import folder_paths` (`:8`) — this file
itself does **not** import `comfy_execution.progress`, `PromptServer`, or
`nodes.NODE_CLASS_MAPPINGS`; those live in the package, not in `studio_loras.py`
(`__init__.py:10` for `PromptServer`, `__init__.py:177` for
`comfy_execution.progress`, `__init__.py:32` for `nodes.NODE_CLASS_MAPPINGS`, and
`studio_stills.py:12` which does `from . import studio_loras`). So the fix is
smaller than assumed: replace **discovery only**, and the audit logic becomes
runnable with ComfyUI stopped. A live process is needed only to resolve which file a
name means. Auditing a file cannot require the thing that serves the file.

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
3. **There is no consumer yet, and this ticket does not invent one.**
   `src/generation/lora/validation.ts` today validates LoRA *config records*
   (`validateLoRAConfig`, `validateLoRAModel`) and *filenames*
   (`isLoRAFilename`, `extractLoRAName`) — no safetensors header, no checksum, no
   tensor comparison. Nothing in loop-lore reads a LoRA file's bytes. The audit
   module is therefore the prerequisite, and wiring its verdict into
   `src/generation/lora/` and the two injection paths is scoped work **after** the
   module exists — stated as a prerequisite, not assumed as done. If nothing in
   loop-lore can consume the verdict, that is recorded here and the ticket is
   narrowed to the module plus its tests rather than a fake consumer being
   invented to justify it.

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
- [ ] **No consumer is invented.** The verdict's declared consumers are
      `src/generation/lora/` (discovery) and the two injection paths
      (`buildLoraNodes`, `injectComfyUILora`); wiring to them is a follow-up
      scoped after the module exists, not assumed. If the audit lands unwired, the
      ticket says so explicitly rather than shipping a stub consumer
- [ ] Test: a LoRA with an extra unmatched tensor reports that tensor by name; a
      clean LoRA audits clean; a corrupt header is rejected without throwing
- [ ] **Provenance recorded.** Every sidecar-derived claim this ticket relies on is
      now **verified by source read** (2026-10-16,
      `.tmp/H3_Stills_5080_Handoff_20260930/ComfyUI-H3-Stills-Only/`): the
      header-parse caps and suffix check (`studio_loras.py:21-34`, count cap `:27`,
      suffix `:33`), the 8 MiB streaming block and cache key
      `(path, size, mtime_ns)` (`:37-47`), the `compatibility` basename rule
      (`:50-53`), the `audit_patch` alias build and raise-not-report behavior
      (`:56-79`, raises `:76-78`), the Dareties basename + SHA-256 constants
      (`studio_loras.py:11-12`, enforced at `studio_stills.py:157-158` and
      `:170-171`), and **which ComfyUI modules the module actually imports** —
      exactly one, `import folder_paths` (`studio_loras.py:8`), used only by
      discovery (`:15-18`); the `PromptServer`, `comfy_execution.progress` and
      `nodes.NODE_CLASS_MAPPINGS` imports are in `__init__.py` (`:10`, `:32`,
      `:177`), not in `studio_loras.py`. Still **not** verified, and to be recorded
      as such rather than as confirmed: (a) the audit's verdicts against a real
      base-checkpoint/LoRA pair on a live ComfyUI, (b) that the pinned
      `DARETIES_SHA` file on disk really hashes to it. For each, the ticket records
      the evidence — an executed test, an observed run, or a written answer from the
      upstream author — and a claim with no provenance is not used as if confirmed
- [ ] `bun run check` green
