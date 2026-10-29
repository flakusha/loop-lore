<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: kontext reference-edit template (first family template, character consistency)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Reference-conditioned proposal 3 (after sdcpp contract ticket + capability probe). First family template (Kontext Dev, 1 reference, character-consistency); wire listAvailable gating. Template list/run gated by installed-node check server-side (listAvailable wired, not client-filtered); run path re-checks linkage authz at use. Note overlap: TASK-qwen-image-edit-21-reference-template.md owns the Qwen 2.1 family template (different checkpoint, OOM/VRAM engineering); this ticket owns the Kontext Dev family template (text-instruction + multi-round chaining). Coordinate on shared reference request model + matrix row conventions; do not duplicate them.

Owner: epic-reference-conditioned-generation.md (Not Started). Verified: ComfyUI no client_id/no /ws; generateComfyUI dims-from-defaults; configs/workflows/*.json set; template-registry listAvailable unwired; image-edit linkage authz routes.ts:78.

Refs: Kontext https://docs.comfy.org/tutorials/flux/flux-1-kontext-dev, https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext, https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev (adapt text-instruction + reference edit shape, multi-round chaining; re-verify against live /object_info at implementation).

Acceptance: lists only with nodes present (listAvailable gating test with/without nodes); side-by-side comparable output; missing node named in diagnostics; fake node inventory per test, no global registry mutation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
