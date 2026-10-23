<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: sdcpp generate/edit duplicated with divergent endpoints and timeouts

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-comfyui-plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

image-engine/sdcpp.ts (img_gen, config deadline) vs sd-server-provider/families.ts (txt2img/img2img, hardcoded 300s). Edit has no LoRA; error mapping differs (failure vs throw); ComfyUI edit hardcodes 120s. Fix: share transport, unify timeout source.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
