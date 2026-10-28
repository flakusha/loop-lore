<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Substance risk assessment

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, licensing, docs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Documented decision: FOSS defaults (Material Maker MIT, ArmorPaint zlib, Materialize-CLI MIT); Substance flagged enterprise-entitlement - optional user-provided tool tier only, no bundling. AC: bridge docs name the defaults plus the licensing fence; no Substance-dependent acceptance criterion anywhere.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
