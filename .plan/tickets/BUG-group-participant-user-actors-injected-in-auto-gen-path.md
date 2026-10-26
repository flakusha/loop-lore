<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Group participant user actors injected in auto-gen path

**Status:** Done
**Status Note:** 2026-10-26 sweep-B code verify: user actors excluded in auto-gen: src/generation/auto-gen/prepare-generation.ts:86-92 (actor_type <> user) and src/generation/auto-gen/group-cascade.ts:164-190. Findings: .tmp/reviews/2026-10-26-sweep-B/BUG-group-participant-user-actors-injected-in-auto-gen-path.md
**Priority:** medium
**Effort:** Small
**Epic:** epic-context-injection-correctness

**Summary:**

No description provided.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 18b8bfa (registry tip: 891f40e70 Konstantin Fedotov Close issue)
