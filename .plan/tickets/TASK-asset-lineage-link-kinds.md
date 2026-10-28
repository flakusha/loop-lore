<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Asset lineage link kinds

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-lineage-provenance
**Tags:** assets, lineage
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add a link-kind vocabulary (source / derived / variant / edit) to lineage rows via new columns or a dedicated table (decided at design); asset_links stays polymorphic. AC: an img2img output links back to its source with the right kind; the kind vocabulary is validated at write.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
