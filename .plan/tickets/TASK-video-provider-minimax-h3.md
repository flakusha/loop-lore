<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: MiniMax H3 local workflow provider

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-video-generation
**Related:** `TASK-video-gen-route.md`, `TASK-video-template-schema.md`, `TASK-ivss-video-run-pipeline.md`, `FEAT-DIRECTOR-TIMELINE-SCENE-MAPPING.md`, `TASK-hosted-video-and-audio-api-benchmark-tier.md`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Expose MiniMax H3 as a local ComfyUI workflow provider behind the shipped video
route: a checked-in API-format workflow row with a recorded hash and declared
required nodes, dispatched through `runVideoRender` and the per-box serial gate.
The hosted BYO-key API client originally specified here is deferred to the
benchmark tier; this ticket never implements it.

**Context:**
`epic-video-generation.md` already rescoped this ticket on 2026-10-29: local
ComfyUI workflow runs replace the hosted API client as the default, and hosted
providers stay behind BYOK consent. The 2026-11-18 H3 research confirms the
local soft fork carries the H3 nodes and that core `SaveLatent` cannot handle
H3 `NestedTensor` latents; use an H3-aware package node or a custom workflow.
The 2026-11-19 operator direction is to avoid full dependence on the MiniMax H3
Director node pack: it carries maintenance churn and has no precise per-fragment
cut control by design. The provider row must therefore name a pinned workflow,
not a node pack, and must accept custom workflows for render, re-render, prompt
and latent save/load. The shipped converter (`src/generation/comfyui-converter/`)
and fixture `v-0010-dasiwa-minimax.json` prove the transport shape but do not
make that graph mandatory.

**Acceptance Criteria:**

- [ ] A versioned workflow-library row declares its API-format hash, `{{var}}`
      parameter map and `required_nodes`; ingest rejects a missing node with the
      named node id, never a silent submit
- [ ] Provider selection uses the existing `generation.providers.video` config
      and `VideoApiFamily = comfyui`; no new provider family or BYO-key client
- [ ] Dispatch goes through `runVideoRender`, `localBox` gate and the existing
      pre-dispatch VRAM hook; the submit route keeps its 401/403/202 contract
- [ ] A custom H3 workflow with explicit cut windows can be substituted by
      workflow id without changing the provider code path
- [ ] The hosted MiniMax API is untouched and remains in
      `TASK-hosted-video-and-audio-api-benchmark-tier.md`
- [ ] Unit tests cover payload build, missing-node rejection, poll/timeout and
      failover against a stubbed ComfyUI — no live render or API call
