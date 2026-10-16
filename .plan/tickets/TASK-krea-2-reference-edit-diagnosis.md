<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Diagnose the Krea 2 reference-edit failure

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** `epic-reference-conditioned-generation`
**Related:** `TASK-krea-2-reference-edit-template.md`, `TASK-reference-capability-probe-runtime.md`, `epic-comfyui-plugin.md`, `epic-model-family-presets.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Find out why Krea 2 reference editing "does not work" and record the answer. A
diagnosis with a named root cause, not a retest.

## Context

`epic-comfyui-plugin.md` carries the claim in two places and both hedge:

- *Practical Testing Results*: "Krea 2 Edit | **Not working** | Samples look good,
  needs retest"
- *Phase 3*: "Krea 2 template (after retest root-causes the current failure)"
- *Open Questions* #6: "Why does it fail in ComfyUI? Machine-specific or model issue?"

`epic-assistant-generation-extensions.md` repeats it as "Not working | ~12GB |
Needs retest". Nobody has investigated it. The phrase "samples look good"
next to "not working" is the tell: the outputs are probably fine and something in
the *pipeline* is wrong, not the model.

This is separated from the template ticket deliberately. Writing a workflow JSON
for a model whose failure mode is unknown produces a template that reproduces the
failure. Diagnosis first, template second
(`TASK-krea-2-reference-edit-template.md`).

Candidate causes worth testing in order of cheapness — none of these require
guessing from the outside:

1. **Substitutor type coercion.** `substituteWorkflow` coerces every `{{var}}` to
   string. This is a known, documented defect in
   `epic-comfyui-first-class-citizen.md` (*Defect 1*), and ComfyUI's `/prompt`
   validator type-checks `INT` inputs. `configs/workflows/txt2img.json` and
   `img2img.json` are affected too. If Krea 2's sampler takes an int seed or
   resolution, it fails here and fails **at submit**, which an operator reading
   "samples look good" would not connect to a string coercion.
2. ~~LoRA node-id allocation.~~ **Ruled out — do not spend time here.**
   `injectComfyUILora` used to derive its node id with
   `Math.max(...Object.keys(nodes).map(Number)) + 1`, which is `NaN` on
   colon-grouped ids like `60:45`. That is **fixed**: it now calls the shared
   `allocateNodeId` (`src/generation/node-id.ts:20`, called at
   `src/generation/lora/discovery-comfyui.ts:196-198`, with the `NaN` failure named
   in the comment there). `buildLoraNodes` is fixed by the same work — its
   `reserved` parameter is required precisely because ids used to be hardcoded
   from 100 (`src/image-edit/templates/builtin/lora.ts:37-54`).
   `epic-comfyui-first-class-citizen.md` still lists both as open defects; that
   checklist is stale here. Re-verify any of its defect claims against the code
   before acting on them.
3. **Not the model.** The recorded ~12GB VRAM is an estimate from a session that
   also recorded "strange results" for Klein — the environment, not the model, may
   be the variable.

The probe (`TASK-reference-capability-probe-runtime.md`) does the pre-flight
node-pack check and the reference-count sweep; this ticket supplies the
Krea-2-specific hypothesis and the write-up.

## Acceptance Criteria

- [ ] The failing configuration is reproduced from a clean state, with the exact
      workflow JSON and the exact error or wrong output captured
- [ ] Root cause is named specifically — a file, a line, or a node misconfiguration
      — not "the model does not work" or "needs retest"
- [ ] Candidates 1–3 above are each explicitly eliminated with evidence, so the
      answer is not "we tried some things"
- [ ] If the root cause is a **pipeline** defect (substitutor, node-id allocation),
      that defect is filed or linked as its own ticket and this ticket closes with
      the link — the pipeline fix must not be smuggled in here
- [ ] `epic-comfyui-plugin.md` and `epic-assistant-generation-extensions.md` gain a
      corrected status line naming the cause, replacing the hedged prose
- [ ] `bun run check` green
