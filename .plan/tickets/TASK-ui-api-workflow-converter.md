<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: UI API workflow converter

**Status:** Done
**Status Note:** merged to dev (src/generation/comfyui-converter/, fixtures, 21 tests), gates-verified by the owner 2026-10-30
**Priority:** medium
**Effort:** Large
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, converter, workflows
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Generic, library-level UI-format to API-format ComfyUI workflow
converter: subgraph flattening, promoted-widget substitution, link rewrite,
and hidden JSON widget preservation — **offline**: it converts a saved
UI-format workflow JSON (no editor, no live graph) guided by a pinned
`/object_info` snapshot, following the current frontend export behavior
(`graphToPrompt`, comfyui-frontend-package 1.57.6) with the Unlicense
SethRobinson converter as reference implementation. Driven by the v-0010
Director workflow as fixture; cross-linked from the IVSS epic.

**Context:**

Shipped implementation license-clean references (see `src/generation/comfyui-converter/fixtures/README.md`): the Unlicense-licensed SethRobinson converter (https://github.com/SethRobinson/comfyui-workflow-to-api-converter-endpoint) as reference implementation; the MIT-licensed comfy-workflow-studio analyzer (`py/services/workflow_analyzer.py`, (c) 2026 ketle-man) for traversal primitives with attribution; ComfyUI frontend source (GPL-3) and krita-ai-diffusion (GPL-3) were behavior-study only, never ported.

**Acceptance Criteria:**

- [ ] Converts a **saved** UI-format workflow (file on disk, editor absent):
      the v-0010 fixture (subgraph "Checkpoint settings", 47 inner nodes)
      produces a submittable flat API graph with colon-path node ids
      (`<containerId>:<innerId>`), committed as a fixture.
- [ ] Widget values map **by name** when `widgets_values_named` is present;
      positional `widgets_values` fallback resolves widget order via
      `input_order` from the `/object_info` snapshot; unresolved widget inputs
      are named in a converter report, never silently dropped.
- [ ] Subgraph-boundary inputs are flattened correctly: a link entering the
      subgraph lands on the inner `inputNode`'s target; outputs exit from the
      `outputNode`; global-subgraph references (by definition id from
      `GET /global_subgraphs`) are fetched and inlined.
- [ ] Muted (`mode 2/4`) and bypassed (`mode 8`) nodes are excluded and their
      consumers' dangling inputs pruned, matching frontend export; hidden JSON
      widgets (`serialize !== false`) preserved; array widget values wrapped
      `{__value__: [...]}`.
- [ ] The converter is a pure function over (workflow JSON, object_info
      snapshot) — unit-tested without a server; a subgraph-free reference
      workflow converts identically to its own editor-exported API form
      (round-trip fixture).
- [ ] Converter report: dropped-muted/bypassed list, unresolved inputs, and
      node-pack identity (`_meta.cnr_id`/`aux_id`/`ver`) emitted for reuse by
      `missingRequiredNodes`.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
