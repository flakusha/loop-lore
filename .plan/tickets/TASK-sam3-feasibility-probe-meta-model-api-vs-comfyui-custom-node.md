<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: SAM3 feasibility probe — Meta Model API vs ComfyUI custom node

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-sam3-segmentation-integration
**Tags:** segmentation, comfyui, spike
**Depends on:** —
**Related:** epic-comfyui-plugin.md, epic-byok-local-models.md, TASK-comfyui-node-discovery.md, TASK-comfyui-template-parameter-validation.md

**Summary:**

Probe both SAM 3 integration paths — hosted (Meta Model API, SAM 3.1) and ComfyUI (community SAM3 custom-node pack) — then pick the initial target for `epic-sam3-segmentation-integration`.

**Context:**

The epic defers the path decision to this probe because two unknowns decide ticket sequencing: the Model API request/response shape (auth, concept-prompt format, mask encoding) and the ComfyUI node graph shape (node classes, INT vs STRING inputs — the first-class-citizen substitution defects bite hardest here). No implementation ticket in the epic starts until this lands.

**Acceptance Criteria:**

- [ ] Meta Model API SAM 3.1 documented from primary sources + a probe run: endpoint, auth header, image encoding, concept-prompt format, box/mask response encoding (record a blocked credential as evidence, not a guess)
- [ ] ComfyUI path: a reference SAM3 workflow identified; its node classes and input types recorded; a fixture graph checked against the repo's `isValidWorkflow` and the `/object_info` discovery path
- [ ] Cost/latency per path recorded (hosted quota/limits vs local GPU requirement)
- [ ] Decision recorded in this ticket + the epic's "Integration paths" section gains a settled-decision line naming the initial target and the fallback
- [ ] Findings written to `docs/meta/research/sam3-integration-probe.md` (precedent: `docs/meta/research/comfyui-first-class-investigation.md`)

## Technical Notes

- Primary sources: Meta SAM 3 page (`ai.meta.com/sam3`), SAM 3.1 model page (`developer.meta.com/ai/models/sam-3-1`), Meta Model API SAM docs (`ai.developer.meta.com/docs/sam`).
- Do not probe against production assets — use a synthetic fixture image.
- The ComfyUI fixture graph doubles as the test fixture for `TASK-comfyui-sam3-concept-mask-template`.
