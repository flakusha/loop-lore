<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox residency control plane for pre-render release

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** honkbox
**Epic:** epic-platform-integrations
**Caveats:** admission-queue interplay — a queued request may re-load a model immediately after release, so drain semantics (does release fail with Retry-After, does it drain the queue first?) must be defined honkbox-side; operator pin/TTL models must not be released by the route without an explicit override; the new surface ships behind a capability flag so older honkbox builds degrade cleanly; loop-lore-side release failure must stay non-fatal (warn) exactly as today.

**Summary:**

Honkbox manages model residency internally (swap manager, operator pin, TTL, admission queue with queue_wait + Retry-After) and exposes no external warm-set read or unload route. loop-lore's pre-render release flow `src/llm/llama-swap-release.ts:60-111` (`releaseModelsForRender`) speaks llama-swap only (`/running`, `/api/models/unload/:id`) — pointed at honkbox it degrades to probe-fail + warn, so no VRAM is reclaimed before video renders. Consumer: the video render path + the llama-swap release flow.

Honkbox-side prerequisite: an operator-authenticated read of warm/loaded models (warm-set snapshot endpoint) plus a targeted unload/release route (per model or per job lease), both behind honkbox's bearer layer.

**Acceptance:**

- honkbox exposes the warm-set read + release route behind its bearer layer.
- loop-lore's release flow probes honkbox first, llama-swap second (or config-selected backend).
- release failure stays non-fatal (warn) exactly as today.
- A capability flag gates the new surface so older honkbox builds degrade cleanly.

**Context:**

Evidence (verified 2026-11-22): honkbox residency is internal-only — swap
manager, operator pin, TTL, admission queue (`queue_wait` + `Retry-After`);
no external warm-set read or unload route exists. loop-lore consumer:
`releaseModelsForRender` (`src/llm/llama-swap-release.ts:60-111`) targets
llama-swap `/running` + `/api/models/unload/:id`; against honkbox it
degrades to probe-fail + warn (no pre-render VRAM reclaim), on the video
render path. Related: TASK-honkbox-provider-wiring-and-gpu-admission-ownership.md
(admission ownership stays single-sided) and
TASK-honkbox-generation-result-delivery-and-asset-ingest.md (prior
honkbox-side-prerequisite pattern this ticket mirrors).

git issue: acdbc4a

**Acceptance Criteria:**

- [ ] Honkbox warm-set read + targeted release route land behind its bearer layer, gated by a capability flag.
- [ ] Drain semantics for the admission queue defined honkbox-side (Retry-After vs queue drain) and documented.
- [ ] loop-lore release flow probes honkbox first, llama-swap second (or config-selected); release failure stays warn, non-fatal.
- [ ] Targeted release-flow tests pass for both backends and the degrade path.
