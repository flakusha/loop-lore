<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin system-config DELETE passes user-controlled key without validation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The DELETE /api/v1/admin/system-config/:key handler (src/routes/admin/system-config.ts:183-195) passes ctx.params.key directly to deleteConfig() without validating it against known config keys. Impact: A client can attempt to delete arbitrary config entries. Fix: Validate key against the known config key set before calling deleteConfig.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
