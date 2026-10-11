<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Admin system-config DELETE returns 400 for keys the test expects to delete as 204

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
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
