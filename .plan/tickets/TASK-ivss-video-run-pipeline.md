<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS video run pipeline

**Status:** In Progress
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Related:** `TASK-ivss-shot-grammar-assembler.md`, `FEAT-DIRECTOR-TIMELINE-SCENE-MAPPING.md`, `TASK-ivss-continuation-and-assembly.md`, `epic-video-generation.md`
**Tags:** ivss, comfyui, video
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Run one persisted IVSS render fragment end to end: compile its scene to the
shot-grammar payload, submit it through an injectable kind-aware ComfyUI client,
poll the output refs, persist the clip (and any H3 latent package) as assets,
and link them back to the fragment and its scene. The client, workflow loader
and dispatch gate are seams, so CI drives the whole flow with a stubbed ComfyUI.

**Context:**
The 2026-11-19 full-cycle-director review
(`.tmp/research/full-cycle-director-review-2026-11-19.md` §3, step 4) puts this
after the fragment schema and the byte-stable shot grammar. Reuse what already
ships: `compileShotGrammar` for the variable map, `getWorkflowLoader()` for
`{{var}}` substitution without editing node code, `dispatchThroughVideoGate`
for the one-render-per-local-box gate, `persistGeneratedImages` for asset rows,
and the `video-jobs` store for list/cancel/poll. The fragment row owns the
queue-time facts (workflow id/hash/version, seed, take, prompt snapshot, frame
count), so a retake never rewrites a sibling. Seeds remain text above 2^53.
Reference upload now reads scenario/scene/shot-scoped `scenario_references`
rows, uploads owned asset bytes with `ComfyUIClient.uploadImage`, and sends
`role = "mask"` rows through `POST /upload/mask` overlaying the preceding
image. The stored names are passed to the workflow loader as
`reference_slots`. honkbox render offload stays behind its own live flag.

**Acceptance Criteria:**

- [x] A fragment run compiles its scene/shots, loads the pinned workflow with
      the `prompt` / `timeline_data` / `builder_state` variables, and submits it
      through the injected ComfyUI client
- [x] The per-box dispatch gate wraps the render; queue-time facts are written
      to the fragment before submit, and a second run on a claimed fragment is
      rejected
- [x] Output refs are polled via `waitForFiles`; the video sink is downloaded,
      persisted as a video asset, and linked to the fragment, scene and owning
      world; distinct latent refs become distinct assets
- [x] Big seeds survive as strings through the workflow variables and the
      fragment row (>2^53 round-trip)
- [x] The video job is listed as pending then done; cancel before submit marks
      the fragment cancelled and never submits; an engine failure marks the
      fragment and job failed
- [x] Scenario-, scene- and shot-scoped references upload before submit, mask
      rows use `POST /upload/mask` with a preceding image, and slot names reach
      the workflow variables
- [x] Tests exercise the full flow against a stubbed ComfyUI, are per-test
      isolated, and targeted tests/gates are green
