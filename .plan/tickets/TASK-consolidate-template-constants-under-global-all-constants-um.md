<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Consolidate template constants under global all-constants umbrella

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

D4 + umbrella decision 2026-09-03 (design task, epic candidate). Globally consolidate template constants under one umbrella (supersedes per-family duplication: image-edit builtins {img2img,inpaint,controlnet,txt2img}.ts 300t/60l etc., and config/sections/generation/{sd,llama}.ts template shapes). Requirements from user: constants treated as data, not code (skipped by eslint code checks); statically linked / present in app at start; extendable and overridable via configs/ by admin or app user. First step: enumerate all template-constant families, then design the umbrella + override mechanism.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
