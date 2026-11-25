<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: ComfyUI Plugin & Workflow Templates

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-comfyui-plugin

## Summary

ComfyUI plugin: node discovery, template registry, GGUF model loading workflow. From Epic (ComfyUI Plugin).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Research addendum (2026-11-25)

- Workflow catalog shape: digest-pinned manifest, version pins, license/NOTICE, no network fetch at runtime.
- Parameterization surface already owns first-class inputs; do not duplicate it in the template loader.
- Deferred third-party packs require operator approval before any import.
