<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox generation-result delivery and remote-asset ingest

**Status:** Done
**Scope:** Honkbox integration — SSE consumer, artifact client, remote-asset ingest
**Priority:** medium
**Effort:** Medium
**Epic:** epic-platform-integrations

**Summary:**

**Summary:** Make honkbox generation results land in loop-lore's asset store. Honkbox
returns images inline as base64 today (`data[].b64_json`) and exposes a liveness-only SSE
feed (`/v1/events`) plus a content-addressed artifact store (`POST /v1/artifacts`,
`GET /v1/artifacts/{id}/bytes`). loop-lore has no honkbox SSE consumer, no artifact client
and no remote-asset ingest path, and its asset store cannot accept a GLB at all. This ticket
adds the client side: a delivery-mode switch, an SSE consumer with reconciliation, a
streaming artifact download, and an ingest path that validates, hashes, stores and links
remote bytes into `assets`/`asset_links`.

**Acceptance:** One honkbox image run in artifact-delivery mode lands as a loop-lore asset
row (validated, hashed, linked to the chat/message) with no base64 on the response path; a
cancelled or failed run leaves no asset row; a dropped SSE frame is recovered by
reconciling against `GET /v1/jobs` (never a silent success); a GLB from the honkbox blender
route ingests as a model asset with the correct MIME/extension, streamed (never fully
buffered) on the way in; bearer auth is used for every honkbox call and the key is never
exposed to the browser; GPU admission ownership stays single-sided (`queue.gpuSlots > 0` ⇒
honkbox admits, loop-lore holds no scheduler slot).

git issue: 22b5def


**Caveats:** honkbox-side prerequisites (artifact delivery mode, `job_result`/`job_progress`
SSE frames, capability flags) land in the honkbox repo — this ticket is the consumer and
must fail closed (named error) when they are absent; SSE is transition-only, so a missed
`job_finished` leaves the result discoverable only via the artifact id; encryption tiers and
the quota gate apply to remote bytes exactly as they do to uploads; the current upload path
buffers the whole body before the size check (`request.formData()` → `file.arrayBuffer()` →
`validateFileSize`), so the remote path must stream to a temp file instead of reusing it;
`validateMimeType` currently refuses `model/gltf-binary` outright, and `docs/spec/assets.md:16`
advertises `ASSET_MAX_*`/`ASSET_ALLOWED_*` env vars that do not exist in `src/` (the enforced
limits are `config.assets.maxFileSize` + the MIME allowlist) — either enforce the spec or fix
the spec.

**Context:**

- Honkbox image route: `POST /v1/images/generations` → b64_json only
  (`crates/server/src/routes/images_inputs.rs:81` rejects other `response_format`).
- Honkbox SSE: `GET /v1/events` → `job_registered` / `job_cancelled` / `job_finished` only;
  `events_dropped` gap frames; no replay, no per-job filter, no progress.
- Honkbox artifact store: `POST /v1/artifacts` (chunked, resumable) and
  `GET /v1/artifacts/{id}/bytes` (200/206 ranged) — content-addressed by sha256.
- Honkbox blender route: `POST /v1/jobs/blender` → 202 `{job_id, status, bundle}`; outputs
  land in `<data_dir>/jobs/{bundle}/` and are served by
  `GET /v1/jobs/{id}/bundle.zip` and `GET /v1/jobs/{id}/content/{name}`.
  Those bytes are NOT content-addressed; this ticket's honkbox prerequisite
  promotes each output into `GET /v1/artifacts/{id}/bytes` and records the
  artifact id in `manifest.json`.
- Frozen wire contract (honkbox `FEAT-artifact-delivery`): `X-Honkbox-Delivery:
  artifact`; response fields `artifact_id`, `content_type`, `size_bytes`,
  `job_id`; SSE `job_progress {event,id,kind,step,pct}` and
  `job_result {event,id,kind,artifact_id,sha256,size_bytes}`; capabilities
  `features.artifact_delivery` + `storage.data_dir_present`.
- loop-lore storage seam: `src/assets/service/create.ts:createAsset` (hash → quota →
  encrypt → store → thumbnail → INSERT on conflict → link).
- Reuse, do not rebuild: SSE frame reading in `src/cli/headless.ts:259-285`; server-side SSE
  emitter `src/routes/sse-stream.ts`.
- loop-lore gaps: no honkbox `/v1/events` consumer; no artifact client; `AssetType` has no
  model kind; `MIME_MAP` lacks `model/gltf-binary`; `validateMimeType` refuses GLB; upload
  path buffers whole bodies; `HONKBOX_FEATURE_KEYS` lacks `blender`.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification (2026-11-20)

`bun run typecheck`, `bun run typecheck:frontend`, `bun scripts/check-db-schemas.ts`, and 325 targeted tests (honkbox integration, asset validation, storage budgets, gallery views) green. Real-server loopback smoke proved chat turn, artifact-mode image job, matching SSE `job_result`, mid-run cancel, jobs/events/metrics routes and honkbox-owned GPU admission; asset-store creation/ingest is covered by isolated tests in `src/integrations/honkbox`.
