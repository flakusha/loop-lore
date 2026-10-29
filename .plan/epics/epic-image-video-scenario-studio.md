<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Image/Video Scenario Studio

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Filed 2026-10-28 (plan branch `plan-ivss`) from the IVSS research package, on the 2026-10-28 user correction: ComfyUI is the **unified** generation backend across creative AND chat/avatar flows. Consumable before the video engine exists — authoring + payload preview run against a stubbed backend.
**Priority:** Medium-High
**Effort:** XL
**Type:** Feature Epic
**Tags:** video, image, scenario, shots, timeline, editing, comfyui, worlds, locations, assistant, collaboration, browser-editors

## Overview

loop-lore can store video assets, compose video prompts, and walk a user
through a video prompt in the assistant — but has no editable
scenario/scene/shot document, no video generation engine or run pipeline,
no editing surfaces (browser or external), no mask authoring for i2i
inpaint, no annotation/collaboration layer on creative artifacts, and no
binding between creative scenarios and the world/location/chat spine. IVSS
owns the product surface: world-bound scenario documents (scenes = run
units, shots = intra-clip blocks), the reference-collection + run pipeline
that drives ComfyUI video/image workflows (the Director as first-class
default tier in this instance — operator decision 2026-10-29 — with Wan
as the Apache-2.0 family alongside), the browser editing tiers (timeline, mask painter, storyboard,
handoff), the headless editing tiers (MLT EDL render, auto-editor), the
world/location/session binding with cross-reference via the filed lineage
tickets, and the dual-use export profiles. Engine tiers themselves are
owned by `epic-video-generation.md`.

## Goals

- **Scenario documents first-class and world-owned**: scenes (the run
  unit: one clip = one prompt assembly = one output asset = one seed) with
  mode/duration/seed control; shots as `[Shot N]` blocks with absolute
  target-video timestamps and cut vocabulary; lane-typed reference
  collections (image/video/audio) at project/scene/shot scope.
- **Run pipeline**: compiles scenes into workflow payloads (Wan core
  templates + the Director's `timeline_data`/`builder_state`), uploads
  references asset-id-style, submits through the kind-aware ComfyUI client,
  tracks long jobs, and persists outputs as lineage-linked assets with
  generation facts captured at queue time (metadata epic seam).
- **Editing tiers**: in-graph editing (VACE/Director), server-side EDL
  render (MLT XML + `melt`), NLE handoff (auto-editor XML), and browser
  preview trims (WebCodecs + mp4box.js).
- **Browser authoring**: timeline widget (vis-timeline), Konva brush-mask
  painter (the i2i-inpaint gap), Excalidraw storyboard, miniPaint/Photopea
  handoff for deep image edits.
- **Binding**: scenarios owned at world level; scenes may reference
  locations; chats/sessions reference scenarios (never copy);
  cross-reference + retention ride the filed lineage/metadata tickets.
- **Collaboration**: Frame.io-shaped annotations (time range + region +
  body), optimistic concurrency on docs, transactional shot claims,
  world-member roles for shared libraries (Penpot-shaped, no CRDT; full
  realtime co-editing was explicitly considered and deferred — the future
  path if multi-master/realtime requirements emerge).
- **Dual-use export**: bundle profiles (DCC bag / publish / chat-clip) over
  lineage + licensing rows; provenance embedded, watermarks as content
  labels not tier gates.

## Non-goals

- Video model integrations/engine tiers, GPU gating, BYOK API providers
  (owned by `epic-video-generation.md`).
- Transport (`client_id`/`/ws`) — owned by `epic-comfyui-plugin.md`.
- A second metadata/lineage/provenance format — filed epics own it; IVSS
  consumes and extends with video-specific fact fields.
- Audio *generation* (TTS/music/SFX epics); soundscape *prompts* and audio
  reference lanes are in scope.
- A full browser NLE — timeline is an authoring/review surface; finishing
  happens in-graph, via melt, or by NLE handoff.
- sdcpp-bridging work — the sdcpp disposition is decided (2026-10-29:
  opt-in lightweight fallback); no sdcpp-bridging work is proposed.

## Data model sketch

- `scenarios` — `world_id` (FK, NOT NULL), `owner_id`, `title`, `status`,
  audit + `record_hash`. Scenes/shots/references/docs/annotations cascade.
- `scenario_scenes` — run unit: `scenario_id`, `sort_order`,
  `location_id` (nullable FK), `mode` (t2v | i2v_ff | i2v_flf | v2v_edit |
  continuation | image), `duration_seconds`, `seed_mode`+`seed_value`
  (string), run-state columns, `generated_asset_id`.
- `scenario_shots` — `[Shot N]` blocks: timestamps (ms, absolute in-clip),
  description, `cut_type` (prompt vocabulary), camera JSON, narration.
- `scenario_references` — ordered, lane-typed, scope-checked rows
  (project/scene/shot), asset FK, trim/stream fields for media refs.
- `scenario_docs` — scenario/plot/synopsis/soundscape/music text docs with
  a `version` column (optimistic concurrency).
- `annotations` — `target_type`+`target_id`, `author_id`, `t0_ms`,
  `t1_ms` (nullable), `region` JSON (nullable), `body`, `resolved`.
- `AssetLinkEntity` gains `Scenario`/`Scene`/`Shot` values (link-based
  surfacing); cross-reference/usage queries ride the lineage tickets.
- Reference-lane → runtime-slot mapping stays a compile-time concern
  (Director positional slots; Wan single/multi-image conditioning),
  enforced at run validation, not storage.

## Sequencing

VG engine seams + IVSS data model first; authoring surfaces and the run
pipeline next; browser editor tiers and DCC tiers in parallel; export
profiles last (after lineage/licensing land).

## Tickets (this epic)

| Ticket | Scope | AC (one line) |
| ------ | ----- | ------------- |
| `TASK-ivss-scenario-schema` | Migration: scenarios/scenes/shots/references/docs/annotations + enums + `AssetLinkEntity` values + sync artifacts | Migration up/down green; a scenario with 2 scenes × 3 shots + refs + docs round-trips; shots outside a scene rejected |
| `TASK-ivss-scenario-crud-and-pages` | Routes + TypeBox schemas + world-edit-style pages (Scenario \| Shots \| References \| Runs tabs) + i18n | Owner/member CRUD with 401/403/404 matrix tested; page flow edits the same rows the assistant workflow reads |
| `TASK-ivss-shot-grammar-assembler` | Compile scenes → resolved prompt (`[Shot N]` absolute-timestamp blocks + soundscape/music) + reference-slot assignment; budgeted assembly (`src/memory/budget.ts` pattern) | Assembler output byte-stable for fixed inputs; over-budget prompts are truncated per documented priority, never silently |
| `TASK-ui-api-workflow-converter` | UI-format → API-format converter (subgraph flattening, promoted-widget substitution by index, link rewrite, hidden JSON widget preservation) — generic, library-level; **lives in `epic-comfyui-first-class-citizen.md`** (cross-linked) | v-0010 converts to a submittable API graph (fixture) and a subgraph-free reference workflow converts identically |
| `TASK-ivss-video-run-pipeline` | Scene run: compile → upload refs (asset-id contract; masks via `POST /upload/mask`) → submit via kind-aware client → track via the jobs API (list/cancel) → poll → persist clip asset + facts → link to scene | First video-kind consumer of `waitForFiles`/`runWorkflowFiles`; run against stubbed ComfyUI in CI; seeds survive as strings (>2^53 round-trip test) |
| `TASK-ivss-run-validation-gate` | Mode-vs-reference compatibility, lane ceilings, trim ranges, audio-needs-visual, frames-vs-duration (24 fps ×2 math) | Invalid scene fails with named constraint BEFORE any upload/submit; every rule unit-tested against Director/Wan limits |
| `TASK-ivss-run-jobs-queue-gating` | DB-backed run jobs (emotion-avatar job-records pattern) + flow-control/cancellation + rate-limit policy entry + per-workflow `min_vram`/capability probes | A cancelled run stops within one poll interval and persists its terminal state; a missing-model run fails fast with the probe's explanation |
| `TASK-ivss-continuation-and-assembly` | Director Continuity + Join Clips + MLT XML EDL generation and `melt` render tier (subprocess, like the Blender bridge pattern) | A 3-scene scenario renders one assembled video via melt (or Director joins when that tier is selected); melt exit codes surface as run errors |
| `TASK-ivss-mask-painter-frontend` | Konva/Alpine brush-mask painter → mask PNG as asset (feeds image-edit inpaint + VACE video inpaint) | Painting + saving a mask on an asset makes it selectable as the mask input of an inpaint run; eraser/undo/clear included |
| `TASK-ivss-shot-timeline-widget` | vis-timeline-based shot timeline (reorder, timestamps, status chips) + WebCodecs/mp4box.js preview trim on generated clips | Reordering + timestamp edits persist; a preview trim never re-encodes server-side (keyframe-aligned remux or marked "needs server render") |
| `TASK-ivss-storyboard-excalidraw` | Excalidraw UMD embed (self-hosted assets) with scene JSON stored as an asset link per scene/shot | A storyboard sketch attaches to a scene, reloads editable, and exports PNG into the reference lanes |
| `TASK-ivss-minipaint-photopea-handoff` | Self-hosted miniPaint iframe open-edit-save + optional Photopea link (`server.url` save-back) | "Edit in miniPaint" round-trips an asset into a new asset version with lineage (editor provenance recorded) |
| `TASK-ivss-video-metadata-extractor` | duration/fps/resolution extraction extending `src/assets/metadata.ts` (annex to `epic-multimodal-asset-reuse.md`) | An uploaded/ingested video exposes duration+fps via the asset metadata API; no ffmpeg process spawn per read (cached at write) |
| `TASK-ivss-annotations-surface` | Annotation rows + UI on scenes/shots/assets (time-range highlight, region overlay, resolve) | Two users can annotate the same clip concurrently without data loss; annotations list per scenario exportable as review notes |
| `TASK-ivss-assistant-scenario-workflow` | `scenario-video` workflow template (world/location → scenario → shots → references → soundscape → confirm → dispatch) + `generation-video`/`generation-scenario` dispatch backends (workflow-engine annex) | End-to-end template test against a stubbed backend; confirm-preview renders the same assembled payload the page Run panel shows |
| `TASK-ivss-collab-claim-and-roles` | Optimistic concurrency (`version` columns) + transactional shot claims + `world_members.role` column (`viewer\|editor\|admin`) + shared-library flag on collections | Concurrent doc edit → 409 + current doc; shot claim is compare-and-swap (second claimer sees "claimed by X"); viewer role cannot write |
| `TASK-ivss-export-bundle-profiles` | Bundle profiles (DCC bag: assets + manifests + lineage + licenses[]; publish bundle; chat clip) over `epic-game-asset-pipeline-export.md`'s builder + licensing rows | A scenario export produces a deterministic bundle listing every asset with lineage pointers + license strings; NSFW/NC assets require explicit export consent |
| `TASK-ivss-cross-reference-surface` | "Used in" backlinks + scenario references from chats (session ↔ scenario cross-ref) riding lineage query tickets | Regenerating an asset marks downstream scenes stale within one write (lineage propagation policy); a chat can pin a scenario reference without copying |

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-video-generation.md` | Engine tiers + editing flows + GPU gating + BYOK — IVSS consumes its seams (rewritten by this filing) |
| `epic-asset-generation-metadata.md` | Facts at queue time incl. video run facts (`timeline_data`/mode/seed-as-string); embedded regeneration manifests on outputs |
| `epic-asset-lineage-provenance.md` | Cross-reference, usage backlinks, stale propagation — the retention half of the world-binding goal |
| `epic-licensing.md` | License badges in exports; NC-fenced model tiers never in default bundles |
| `epic-comfyui-first-class-citizen.md` | Workflow library rows for all IVSS workflows; the UI→API converter ticket lives there |
| `epic-comfyui-plugin.md` | Transport (`client_id`/`/ws`) + asset-id upload contract |
| `epic-workflow-engine.md` | Dispatch backends + payload-preview step type (annex extension) |
| `epic-reference-conditioned-generation.md` | Reference lanes map onto its request model — no second vocabulary |
| `epic-view-set-generation.md` | Orbit tier dispatches into IVSS's run seam; frame extraction consumes the video metadata extractor |
| `epic-external-creative-tool-bridge.md` | melt/auto-editor/rawtherapee tiers + Krita ticket + file-watch round-trip (miniPaint/Krita re-ingest) |
| `epic-multimodal-asset-reuse.md` | from-asset i2v; generation-context emits video facts |
| `epic-game-asset-pipeline-export.md` | Export-bundle builder precedent |
| `epic-narrative-publishing-workflows.md` / `epic-blog-system.md` | Publish consumers of export profiles (cross-link only) |
| `epic-world-chat-channels-invites.md` | World membership reality the role column extends |
| `epic-world-locations.md` | Location binding substrate for scenes |
| `epic-assistant-creative-studio-workflows.md` | Assistant workflow-template machinery the `scenario-video` template rides |
| `epic-comfyui-lifecycle.md` | Provisions the local ComfyUI engine every run dispatches through |
| `epic-3d-generation.md` / `epic-scene-environment-world-generation.md` | Creative-3D peers sharing the dispatch/annex conventions |

## Workflows and plugins (operator confirm-before-shipping)

Video/image workflow families (Wan t2v / i2v-first-frame / FLF2V /
VACE-edit / camera-orbit, the Director first-class default tier, LTX speed tier, frame
interpolation, upscale, MMAudio, LatentSync, masked inpaint, first-frame
feeder chain) land as workflow-library rows with a `{{var}}` parameter map
and an acceptance probe = a stubbed or live ComfyUI run verifying the
named observable. No workflow family ships until its probe is green, the
parameter map is reviewed, and its license/VRAM fence is recorded on the
library row. Model acquisition is part of each probe — the current model
tree lacks the Wan and LTX video checkpoints and the
frame-interpolation/latent-upscale weights, so each probe includes
downloading its declared weights with license fences recorded per row.
New ComfyUI packs (WanVideoWrapper, MMAudio, LatentSync wrapper, official
LTX pack, and the Krita-tier controlnet/IPAdapter/inpaint/tooling nodes)
are pinned through the soft-fork's custom-nodes manifest mechanism —
never via ComfyUI-Manager. The Director stack (DaSiWa/KJNodes/GGUF packs)
is already installed and maintained closely and is the first-class
default tier in this instance (operator decision 2026-10-29); its
MiniMax H3 community-license terms are recorded as informational fence
metadata on each workflow row. Packs without a LICENSE file
are flagged and not depended on until upstream licenses; RES4LYF is
research-only and never a default. `melt`, `rawtherapee-cli`,
`darktable-cli`, and `auto-editor` are host-side capability-probed
subprocess tiers, not
ComfyUI plugins.

## Decisions (2026-10-29)

Resolved by the human (2026-10-29); each answer maps to the research
package's fork list:

- **sdcpp's future (1b):** opt-in lightweight fallback tier — no new
  capability work, no parity tickets; revisit deprecation after IVSS
  ships.
- **Local-only vs BYOK cloud video APIs (2b):** the Kling consent-gated
  BYOK tier is in scope for the first release (behind
  `epic-byok-api-keys.md` consent); Veo-via-Gemini stays a later tier.
- **Director/H3 license stance (3a):** first-class default tier in this
  instance (operator decision); MiniMax H3 community-license terms
  recorded as informational fence metadata on the workflow row; Wan
  (Apache-2.0) remains the engine family alongside.
- **Browser video editor ladder (4a):** build — vis-timeline timeline +
  WebCodecs/mp4box.js preview trims; auto-editor/melt handoff; nothing
  adopted (Clapper dormant/GPL, Remotion license + React).
- **Browser image editor ladder (5a):** as staged — in-house Konva mask
  painter, Excalidraw storyboard embed, miniPaint handoff + optional
  Photopea.
- **Photographic ingestion (6a+b):** rawtherapee-cli AND darktable-cli as
  supported co-tiers behind one capability-probed wrapper.
- **Collaboration (7a, c considered):** the minimal model is adopted (no
  CRDT; optimistic concurrency, compare-and-swap shot claims,
  world-member roles, Frame.io-shaped annotations); full realtime
  co-editing (CRDT) was explicitly considered and deferred — the future
  path if multi-master/realtime requirements emerge.
- **Binding ownership level (8a):** scenarios world-owned (`world_id`
  NOT NULL), scenes reference locations, chats reference scenarios —
  never copy; with a scratch-scenario create-in-place flow.
- **Run-job persistence (9a):** DB-backed job records — video renders
  survive restarts.
- **NSFW policy at `generation-video` dispatch (10a):** per-world setting
  defaulting to prefilter-and-label for local backends; block only where
  the world's rating forbids.
- **ffmpeg-shaped host binaries (11a):** melt/auto-editor/rawtherapee
  (and ffmpeg implicitly) as probe-gated optional subprocess tiers with
  exact errors when absent.
- **Converter home (12a):** the UI→API workflow converter lives in
  `epic-comfyui-first-class-citizen.md` (generic library machinery);
  IVSS cross-links it.

## Related

- [`TASK-ivss-scenario-schema.md`](../tickets/TASK-ivss-scenario-schema.md)
- [`TASK-ivss-scenario-crud-and-pages.md`](../tickets/TASK-ivss-scenario-crud-and-pages.md)
- [`TASK-ivss-shot-grammar-assembler.md`](../tickets/TASK-ivss-shot-grammar-assembler.md)
- [`TASK-ui-api-workflow-converter.md`](../tickets/TASK-ui-api-workflow-converter.md) — filed under `epic-comfyui-first-class-citizen.md`
- [`TASK-ivss-video-run-pipeline.md`](../tickets/TASK-ivss-video-run-pipeline.md)
- [`TASK-ivss-run-validation-gate.md`](../tickets/TASK-ivss-run-validation-gate.md)
- [`TASK-ivss-run-jobs-queue-gating.md`](../tickets/TASK-ivss-run-jobs-queue-gating.md)
- [`TASK-ivss-continuation-and-assembly.md`](../tickets/TASK-ivss-continuation-and-assembly.md)
- [`TASK-ivss-mask-painter-frontend.md`](../tickets/TASK-ivss-mask-painter-frontend.md)
- [`TASK-ivss-shot-timeline-widget.md`](../tickets/TASK-ivss-shot-timeline-widget.md)
- [`TASK-ivss-storyboard-excalidraw.md`](../tickets/TASK-ivss-storyboard-excalidraw.md)
- [`TASK-ivss-minipaint-photopea-handoff.md`](../tickets/TASK-ivss-minipaint-photopea-handoff.md)
- [`TASK-ivss-video-metadata-extractor.md`](../tickets/TASK-ivss-video-metadata-extractor.md)
- [`TASK-ivss-annotations-surface.md`](../tickets/TASK-ivss-annotations-surface.md)
- [`TASK-ivss-assistant-scenario-workflow.md`](../tickets/TASK-ivss-assistant-scenario-workflow.md)
- [`TASK-ivss-collab-claim-and-roles.md`](../tickets/TASK-ivss-collab-claim-and-roles.md)
- [`TASK-ivss-export-bundle-profiles.md`](../tickets/TASK-ivss-export-bundle-profiles.md)
- [`TASK-ivss-cross-reference-surface.md`](../tickets/TASK-ivss-cross-reference-surface.md)
- [`epic-video-generation.md`](./epic-video-generation.md) — engine epic (rewritten by this filing)
- [`epic-asset-generation-metadata.md`](./epic-asset-generation-metadata.md) — facts spine
- [`epic-asset-lineage-provenance.md`](./epic-asset-lineage-provenance.md) — lineage spine
- [`epic-comfyui-first-class-citizen.md`](./epic-comfyui-first-class-citizen.md) — workflow library + converter
- [`epic-comfyui-plugin.md`](./epic-comfyui-plugin.md) — transport
- [`epic-comfyui-lifecycle.md`](./epic-comfyui-lifecycle.md) — engine provisioning
- [`epic-workflow-engine.md`](./epic-workflow-engine.md) — dispatch backends
- [`epic-assistant-creative-studio-workflows.md`](./epic-assistant-creative-studio-workflows.md) — assistant tier
- [`epic-multimodal-asset-reuse.md`](./epic-multimodal-asset-reuse.md) — from-asset i2v + video facts
- [`epic-licensing.md`](./epic-licensing.md) — license gates in exports
- [`epic-game-asset-pipeline-export.md`](./epic-game-asset-pipeline-export.md) — export builder precedent
- [`epic-view-set-generation.md`](./epic-view-set-generation.md) — orbit-tier consumer
- [`epic-3d-generation.md`](./epic-3d-generation.md) — creative-3D peer
- [`epic-scene-environment-world-generation.md`](./epic-scene-environment-world-generation.md) — creative-3D peer
- [`epic-external-creative-tool-bridge.md`](./epic-external-creative-tool-bridge.md) — DCC tiers
- [`epic-world-chat-channels-invites.md`](./epic-world-chat-channels-invites.md) — world membership
- [`epic-world-locations.md`](./epic-world-locations.md) — location binding
- [`TASK-video-gen-route.md`](../tickets/TASK-video-gen-route.md) — folded into the VG epic
- [`TASK-video-provider-minimax-h3.md`](../tickets/TASK-video-provider-minimax-h3.md) — folded into the VG epic
- [`TASK-video-template-schema.md`](../tickets/TASK-video-template-schema.md) — folded into the VG epic
- [`TASK-krita-shared-comfyui-tier.md`](../tickets/TASK-krita-shared-comfyui-tier.md)
- [`TASK-bridge-file-watch-roundtrip.md`](../tickets/TASK-bridge-file-watch-roundtrip.md)
- [`TASK-workflow-dispatch-generation-backends.md`](../tickets/TASK-workflow-dispatch-generation-backends.md)
- [`TASK-workflow-asset-pick-step-type.md`](../tickets/TASK-workflow-asset-pick-step-type.md)
- [`TASK-generation-fact-capture-at-queue-time.md`](../tickets/TASK-generation-fact-capture-at-queue-time.md)
- [`TASK-embedded-regeneration-manifest.md`](../tickets/TASK-embedded-regeneration-manifest.md)
- [`TASK-lineage-query-ui.md`](../tickets/TASK-lineage-query-ui.md)
- [`TASK-lineage-propagation-policy.md`](../tickets/TASK-lineage-propagation-policy.md)
- [`TASK-provenance-summary.md`](../tickets/TASK-provenance-summary.md)


git issue: 56eb333
