<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: instance path hygiene close F18 H4 H5

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-configs-path-resolution.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Instance isolation has open holes: a bare PORT can still derive a slug, one global system_config table is shared across instances, and the permission queue serialization is process-local.

**Evidence (dev 2026-11-18):** report 09; F10-F12, F17 and H12 already landed; open items are F18, H4 and H5 with the seven direct system_config SQL call sites enumerated.

**Scope:** drop the bare PORT fallback in slug derivation; add instance_id to system_config via a new forward migration and scope all seven call sites including danger-zone delete; key the permission queue by instance or document the single-process ceiling.

**Acceptance Criteria:**

- [ ] two instances on different binds cannot share a bare-PORT slug
- [ ] system_config rows are instance-scoped
- [ ] migration round-trip test passes
- [ ] permission queue isolation behavior is tested or explicitly documented

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
