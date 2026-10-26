<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin system-config DELETE returns 400 for keys the test expects to delete as 204

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue d69dc94): Route validates the key against stored rows, not a static allowlist: system-config.ts:212-215 uses getAllConfig = SELECT from system_config (src/admin/config.ts:47-48), and the test seeds delete.me first (system-config.test.ts:236). Re-ran the file on dev: bun test src/routes/admin/system-config.test.ts = 25 pass / 0 fail.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-admin
**Issue:** d69dc94

**Summary:**

Pre-existing red test on dev, isolated from any .plan change.

src/routes/admin/system-config.test.ts:184-190 calls DELETE /api/admin/system-config/delete.me and expects 204. It gets 400.

The route validates the key first (src/routes/admin/system-config.ts:195-197) and returns jsonError 'Unknown config key' when it is not in the known-key set, so delete.me never reaches deleteConfig at :199. Either the key-allowlist gained a filter that rejects dotted synthetic keys, or the test predates that validation.

Reproduce on dev: bun test src/routes/admin/system-config.test.ts -> 22 pass, 1 fail.

Decide which side is wrong: if the allowlist is correct, the test must use a real configurable key; if arbitrary keys are meant to be deletable, the validation must not reject them. Fix whichever is correct and re-run the file. Do not paper over by loosening the assertion.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue d69dc94 (registry tip: d7ebc88f7 Konstantin Fedotov Close issue)
