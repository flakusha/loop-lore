<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Align seedDefaults null handling with resolveModelRole defensive checks

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

src/admin/model-roles.ts:68 defensively checks if (!config?.generation) and degrades gracefully, but src/admin/config.ts seedDefaults directly dereferences config.auth.registrationOpen, config.generation.defaultProvider, config.assets.maxFileSize with no guards. Partial config crashes seedDefaults while resolveModelRole survives. Tests mask this with 'as unknown as Config' casts. Fix: add defensive guards to seedDefaults matching resolveModelRole strategy, or document complete-config requirement and validate at call sites (src/server/start.ts:149, src/routes/admin/danger-zone.ts:145). Verify: new test seeds with partial config without throwing.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
