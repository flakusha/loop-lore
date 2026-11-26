<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: giwt object-to-md serializer for lossless ticket regeneration

**Status:** Done
**Scope:** Implement doc-schema and md-roundtrip tickets; verify installed giwt fixes
**Priority:** high
**Effort:** Large
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Hard blocker from the addendum: the md-to-object direction exists (parse to index.json) but no object-to-md serializer does, so normalization is idempotent at field level but the document cannot be regenerated. Body prose, section order, Caveats, Effort, Upstream, Related, Status Note, owner, SPDX, and provenance are all absent from the object form and would not survive a rewrite. Fund serializer after id unification and owner-claim decisions, in the addendum order: serializer, id unification, owner-claim, AC structure. Research: .tmp/research/lolo-harness-doc-schema-addendum-md-roundtrip-2026-11-26.md. Fix site is the giwt package. Acceptance: parse-serialize-parse is a fixed point on the measured corpus.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-26 registry-driven close: git issue 90759e6 (registry tip: 0ef87a1ed Konstantin Fedotov Close issue)
