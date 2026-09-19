<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Align seedDefaults null handling with resolveModelRole defensive checks

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved — already on dev (commit 1b967a2ee "fix(admin): model-roles tests, scanAllProviders typing, seedDefaults null guards"); verified 2026-09-19
**Priority:** Medium
**Effort:** Medium

## Summary

src/admin/model-roles.ts:68 defensively checks if (!config?.generation) and degrades gracefully, but src/admin/config.ts seedDefaults directly dereferences config.auth.registrationOpen, config.generation.defaultProvider, config.assets.maxFileSize with no guards. Partial config crashes seedDefaults while resolveModelRole survives. Tests mask this with 'as unknown as Config' casts. Fix: add defensive guards to seedDefaults matching resolveModelRole strategy, or document complete-config requirement and validate at call sites (src/server/start.ts:149, src/routes/admin/danger-zone.ts:145). Verify: new test seeds with partial config without throwing.

## Acceptance Criteria

- [x] Implementation complete (defensive guards landed in 1b967a2ee)
- [x] Tests passing (src/admin/config.test.ts partial-config describe block)
- [x] Documentation updated (see Resolution below)

## Resolution (verified 2026-09-19)

`seedDefaults` (src/admin/config.ts) now guards every optional section exactly as resolveModelRole does: `config?.auth`, `config?.assets`, `config?.generation?.defaultProvider` (+ optional-chained `defaultModels` lookup). Missing sections degrade gracefully — only non-config defaults seed. Covered by `src/admin/config.test.ts` "seedDefaults with partial config" describe block: empty config, auth-only, assets-only, and generation-only variants all resolve without throwing and seed only the expected keys.
