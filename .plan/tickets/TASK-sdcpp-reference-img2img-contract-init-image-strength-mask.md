<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: sdcpp reference img2img contract (init-image, strength, mask)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-reference-conditioned-generation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Publishing reference-conditioned proposal 2 (after probe dependency). generateSDCPP gains init_image(s) + strength + mask per sd.cpp img2img contract; shared ordered multi-reference model; fail-fast over family caps. LoRA warn-skip preserved. Authorization: image-gen route keeps existing auth guard + authorizeRunLinkage (image-edit/routes.ts:78); per-request provider key scope checked server-side; fail-closed on missing credential; internal engine call is explicit in-process trust boundary (documented, no network), not assumed open. Note overlap: TASK-sd-cpp-reference-edit-parity.md owns capability-flag + fallback decision (endpoint discovery, matrix row, reduction rule); this ticket owns the payload contract (init-image/strength/mask fields, transport call, txt2img-identical guarantee). Coordinate: do not re-probe what the parity ticket records; do not fork pickSdProvider routing (stays with TASK-sd-cpp-provider.md).

Owner: epic-reference-conditioned-generation.md (Not Started). Verified: generateSDCPP POST /sdcpp/v1/img_gen via runSdServerJob (endpoints img_gen|txt2img|img2img); payload sdcpp.ts:63-77; LoRA prompt-inject + warn-skip :40-61; no reference/img2img contract; ComfyUI no client_id/no /ws; workflow-loader over txt2img/img2img/uploads; template-registry listAvailable no production caller.

Refs: sd.cpp server API + IP-Adapter https://github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md, https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/ip_adapter.md (adapt img2img contract + CLIP-Vision consistency path needing no custom nodes).

Acceptance: txt2img byte-identical (recorded-fixture test); img2img returns buffers (recorded-fixture test); over-cap fails with family-named error; LoRA warn-skip preserved; per-test isolated engine opts + fake transport, unique job ids, no shared sdConfig.defaults mutation (clone per test, finally restores); blocking checks: over-cap fail-fast, txt2img regression (payload extension must not break img_gen default path).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
