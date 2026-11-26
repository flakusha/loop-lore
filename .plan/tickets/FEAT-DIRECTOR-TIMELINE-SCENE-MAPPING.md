<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Full-cycle director fragment manifest

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Related:** `TASK-ivss-scenario-schema.md`, `TASK-ivss-shot-grammar-assembler.md`, `TASK-ivss-video-run-pipeline.md`, `TASK-ivss-continuation-and-assembly.md`, `TASK-video-provider-minimax-h3.md`, `TASK-honkbox-media-editing-offload.md`
**Tags:** director, video, fragments, comfyui, honkbox
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Workflow-agnostic director state for project-bound video production: model a
scenario as `scene → shots → render fragments`, where each fragment pins the
workflow and its own operation, seed, cut window, prompt provenance, rendered
video asset and reusable latent asset. The director drives ComfyUI through the
existing workflow library, converter, and video dispatch gate; honkbox is an
optional, capability-gated editing/extraction backend. MiniMax H3 Director is
one possible engine tier, not a dependency: the operator's 2026-11-19 direction
is to avoid its maintenance churn and lack of precise cut/render-fragment
control, and to develop custom workflows for the parts that need exact control.

**Context:**
The 2026-11-18 MiniMax H3 research and its 2026-11-19 operator rulings
(`.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §11) established that a
fragment is not a shot: a Director fragment is a scene containing shots, and
the manifest must keep all three rows separate. Local H3 Director NG already
resumes by caching finished part latents, but its retry unit is a render part,
not an authored cut, and its node pack is maintained outside loop-lore. Custom
ComfyUI workflow JSON can implement render, re-render, prompt, latent
save/load, stitch and post stages with explicit cut windows, using the existing
`{{var}}` + `required_nodes` ingest contract. Prompt/context history belongs in
the existing assistant chat surface; gallery metadata and captioning own review
and discovery. DB substrate lands in `107_ivss_scenario_fragments.ts`.

**Acceptance Criteria:**

- [ ] A scenario persists as separate scene, shot and render-fragment rows; a
      fragment references at most one shot and one scene, and a shot cannot
      exist outside its scene
- [ ] Fragment identity pins the logical workflow id, content hash and version;
      no field assumes any MiniMax H3 Director node exists
- [ ] Operation vocabulary covers `render`, `rerender`, `prompt`, `latent_save`,
      `latent_load`, `stitch`, `audio_fallback`, `postprocess` and `custom`
- [ ] Prompt provenance stores the originating chat message id plus a frozen
      prompt snapshot; gallery asset and caption references are first-class
- [ ] Re-render and latent reuse create a new take with a parent-fragment link;
      invalidating one fragment never deletes its siblings
- [ ] Rendered video and reusable latent are separate asset references with
      independent lifecycle and 14-day retention policy
- [ ] Every honkbox call is capability-gated with a local fallback; honkbox is
      never required for render, prompt or latent storage
- [ ] Tests cover migration round-trip, missing workflow hash, orphan shot,
      parent/take reuse and capability-absent fallback

Imported from git issue 410c2da.

git issue: 410c2da
