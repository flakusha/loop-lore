<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: document dual assistant role-gates

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-continuous-improvement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Document the two assistant role-gate sites so new commands don't assume
single-gate enforcement. Source: assistant integration review 2026-10-23
(gap 9 / rec 10).

**Context:**

Role gating is enforced at two independent sites that must stay in sync:

- Slash path: `src/routes/messages/command.ts:246-249`
  (`getCommandRequirement` + `satisfiesRole`)
- GM natural-language tool path: `src/assistant/gm-tool-execution.ts:126-127`

A command registered for one surface but gated only at the other is a silent
authorization hole.

**Approach**

- Add a header note in `src/assistant/commands/registry.ts` naming both gate
  sites and the rule: every new command must state which surfaces expose it
  and confirm the corresponding gate covers it.

**Acceptance Criteria:**

- [ ] `registry.ts` header documents both gate sites with file:line references
- [ ] Note states the sync requirement for new commands
- [ ] No behavior change (doc-only)
