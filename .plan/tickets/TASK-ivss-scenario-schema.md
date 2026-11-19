<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS scenario schema

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, db, worlds
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Migration for the IVSS substrate: `scenarios`, `scenario_scenes`,
`scenario_shots` and `scenario_fragments`, with enums for scenario status, scene
mode, cut type, fragment operation and fragment status, plus generated schema
artifacts. The fragment row is the render unit: it pins the workflow id/hash,
the operation, seed (stored as text so values above 2^53 survive), cut window,
prompt message and snapshot, gallery asset/caption, rendered video asset and a
separate reusable latent asset, with a parent/take chain for re-render. Seeds
are strings. `scenario_references`, `scenario_docs`, `annotations` and the
`AssetLinkEntity` additions land in `108_ivss_scenario_references_docs_annotations.ts`.

**Context:**
The 2026-11-19 operator ruling in
`.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §11 requires scene →
shots → render fragments as separate rows; the original IVSS sketch stopped at
scenes and shots, which cannot represent resume, retake or precise cut control.
The same ruling asks loop-lore to avoid full dependence on MiniMax H3 Director
nodes, so the fragment row pins a workflow (id, hash, version) and an operation
rather than a particular node pack. Prompt history rides the existing assistant
chat surface; gallery metadata/captioning supplies review and discovery. The
base tables and fragment row land in `107_ivss_scenario_fragments.ts`; the
reference, doc and annotation tail lands in `108_ivss_scenario_references_docs_annotations.ts`.

**Acceptance Criteria:**

- [x] Migration up/down/round-trip green for scenarios, scenes, shots and
      fragments; generated schema artifacts and column-type overrides in sync
- [x] A scenario with scenes/shots/fragments persists and reads back intact; a
      shot outside a scene and a fragment outside a scene are rejected
- [x] Seed and take values above 2^53 round-trip exactly as text
- [x] A re-render creates a new take with a parent-fragment link and does not
      delete sibling fragments; video and latent assets are distinct refs
- [x] `scenario_references`, `scenario_docs`, `annotations` and the
      `AssetLinkEntity` additions land in migration 108
- [x] Targeted tests and `bun run check` green
