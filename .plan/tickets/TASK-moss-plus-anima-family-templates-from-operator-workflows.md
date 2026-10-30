<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Moss + Anima family templates from operator workflows

**Status:** Not Started
**Priority:** medium
**Effort:** medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, workflow-library, image-edit, moss, anima, operator-workflows
**Caveats:** subgraph flattening, widget→input conversion, no-controlnet-assumption, probe-gated

**Summary:**

Turn the operator's moss-edit and anima UI-format workflows into parameterized
workflow-library rows: `i-0037-moss-edit-s/m.json` (ApplyMossImageEdit over a
Flux2-shape latent, SkipLayerGuidanceDiTSimple) and `i-0038-anima.json`
(pipeline in a "Text to Image (Anima)" subgraph with ImpactWildcardProcessor;
VAEDeGrid at top level). Family weights are already on disk (kromoss,
novaFurryAM) — no acquisition. AC: both rows run end-to-end from the
image-edit surface with typed derived params, passing their acceptance
probes; krea2/qwen fixtures are NOT added here (owned by
epic-reference-conditioned-generation Phase 1).

**Context:**

Ingested via the UI-format ingest path (convert → param-map derive → probe),
not a new mechanism. Extends the first-class-citizen operator-workflow table:
anima row 1 delivered only the 10-node `i-anima-0001.json`; `i-0038` is the
richer artifact; moss rows are new. No ControlNet/IPAdapter weights exist
(factpack-v2 §5) and none are assumed.

**Acceptance Criteria:**

- [ ] i-0037-moss-edit-s/m and i-0038-anima ingested via the UI-format ingest
      path; the "Text to Image (Anima)" subgraph flattened; one row per fixture.
- [ ] Moss-edit row runs image → edited image end-to-end; anima row runs
      txt2img end-to-end (wildcard node resolves at runtime).
- [ ] Derived params typed per the param-map derivation; probes green per the
      probe scaffold; weights resolve from the existing external model tree —
      zero weight downloads in AC.
- [ ] Row caveats record: no controlnet/ipadapter assumptions (factpack §5:
      ControlNet/ empty, ipadapter family-mismatched); RES4LYF not used;
      krea2/qwen fixtures untouched (reference-conditioned Phase 1 owns them).

**Depends on:** TASK-workflow-library-ui-format-ingest,
TASK-comfyui-parameter-map-derivation-from-marked-workflows, TASK-comfyui-workflow-acceptance-probe-scaffold
