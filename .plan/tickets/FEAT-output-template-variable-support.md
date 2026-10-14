<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: {{output}} template variable support

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen

**Summary:**

The {{output}} template variable does not exist in the ComfyUI integration. buildSubstitutionVars (workflow-substitutor.ts:191-221) produces: prompt, negative_prompt, width, height, steps, cfg_scale, sampler, seed. No output key. ComfyUI's SaveImage node determines filename server-side. Fix: add output to buildSubstitutionVars and document that workflows can use {{output}} in SaveImage.filename_prefix to route output.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
