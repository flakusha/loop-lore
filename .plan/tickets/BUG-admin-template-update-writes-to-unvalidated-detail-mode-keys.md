<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin template update writes to unvalidated detail/mode keys

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The PUT /api/v1/admin/templates/:id handler (src/routes/admin-templates/update.ts:62-66) writes `updated.templates[body.detail][body.mode]` = body.template without validating that body.detail is a valid DetailLevel and body.mode is a valid SdGenMode. Impact: A client can create orphaned template entries at arbitrary keys that are never read by the generation pipeline, silently corrupting the stored template profile. Fix: Validate body.detail against DetailLevel values and body.mode against SdGenMode values; return 400 on invalid.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
