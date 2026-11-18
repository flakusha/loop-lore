<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# SOL: Blender job boundary and contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Tags:** blender, integration, contract

**Summary:**
Record the cross-repo Blender job boundary so loop-lore and honkbox implement one shape. Operator ruling: when honkbox is the configured Custom-provider base URL, eligible work routes to its local implementation; otherwise loop-lore uses a local sidecar. Hosted endpoints stay a later BYO-key fallback; `harness` driving development is exempt. Blender remains a `blender --background --factory-startup -noaudio --python job.py -- <args>` subprocess pinned to 4.5.15 LTS — never linked (GPL) and never MCP-driven in production.

**Decision:**

- loop-lore owns prompts, scene/view spec, orchestration, asset persistence, feature gates and display; it does not own GPU scheduling, engine binaries or mesh algorithms.
- honkbox owns the process when configured as the backend: supervisor, typed job kind, route and events, artifact bundle. MCP is explicitly rejected there; no MCP client belongs under loop-lore `src/integrations/mcp/` (inbound servers, sibling-owned).
- Capabilities are probed at runtime; no capability means local implementation or a feature-gated-off UI, never an implicit remote call. `FeatureFlags` gate features, not honkbox's reserved `blender`/`3d` queue rows.

**Contract (shared with honkbox `FEAT-blender-job-route`):**
`POST /v1/jobs/blender { input: {assetId|objectKey, format: glb|obj|ply, sha256}, stages: [...], params: {...}, engine: {blenderVersion:"4.5.15", scriptVersion:<sha>}, output: {format:"glb", maxBytes}, manifest: 1 }` → `{jobId, status:"queued"}`; lifecycle via `/v1/jobs` + `/v1/events`; artifacts = output.glb + manifest.json + turntable.webp.
Loop-lore outcome: `{ok:true,meshAssetId,thumbAssetId?,polyCount,manifest}` | `{ok:false,status:"queued"|"unsupported"|"failed",message}`.

**Non-negotiables:**
`.part`+fsync+rename on every artifact; cancel between stages, never mid-bake; `kind=blender` bounded metric labels with no user IDs, paths or prompts; poly-count and file-size caps at the route; capability probe cached per `(baseUrl, credential fingerprint)`. Reuse `emotion-avatar-service/job-records.ts:13-16` status vocabulary and `src/db/state.ts` rather than a new job store.

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability. Capabilities change after probe; cancel only between stages; no user-controlled args reach Blender.

**Acceptance Criteria:**

- [ ] Decision recorded here and cross-linked from `TASK-blender-headless-node-bridge`, honkbox `FEAT-blender-job-route` and the capabilities tickets
- [ ] No implementation in this ticket; implementers cite this contract

**Context:**

Follows `.tmp/research/blender-fullcycle-production-editing-2026-11-18.md` §3. Resolves the ownership/job-shape question left open by the 11-17 review; no implementation here. Honkbox's reserved `blender`/`3d` queue rows are capacity labels, not callable jobs.
