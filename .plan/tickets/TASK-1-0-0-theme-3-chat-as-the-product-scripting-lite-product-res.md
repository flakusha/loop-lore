<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 3: Chat as the product: scripting-lite + product residual

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Rationale: 84 commands registered but no user-authorable composition: pipe operator, shared macro resolver, named args, per-command valves all Not Started; smart-regen transforms + decision gate Not Started. Pair with the narrowed chat-product-features residual (membership re-key, ownership transfer) after re-scoping the 9 already-landed migrations.

Feeds: stscript-guided-generations-2026-11-03 (TASK-shared-macro-engine, TASK-pipe-operator-chaining, TASK-named-arguments, TASK-per-command-valves, TASK-workflow-runner-step-ui; Quick-Reply Done vs macros gap); epic-priority-analysis §B2/C3 (re-scope chat-product-features); §C2 chat-variants-taxonomy

AC3 Scripting-lite: pipe chaining + shared macro resolver + named args + per-command valves shipped with unit tests; smart-regen decision gate in the main pipeline with style-picker UI.

AC7 Chat residual: membership-change re-key + ownership transfer shipped as the re-scoped epic; the 9 landed migrations closed out, not re-litigated.

Related: .tmp/research/release-1.0.0-roadmap.md

**Caveats:** TOCTOU: macro resolution at invocation time; concurrent definition edit uses snapshot. Security: macros expand author-controlled text; no privilege escalation via pipe. Authorization: pipe/valves respect per-command capability tags. Parallelism: parser unit tests use in-memory registry, no shared state. Partial failure: failed pipe stage aborts chain, no half-applied commands. Rollback: macro/pipe are additive syntax; removal restores prior parsing. Observability: pipe failures logged per stage.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
