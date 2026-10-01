<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — size-strict ceiling regressed; split-down + verify before A9

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-code-quality.md
**Type:** Task
**Summary:** The size-strict ceiling regressed since the 2026-08-12 close-out (open-debt.md § Release hardening). The size-strict debt ticket (TASK-size-strict-debt.md) was closed but size growth has pushed multiple files back over the 250L ceiling. This ticket is the split-down + verification pass required before the v0.1.0 tag (A9, open-inflight.md § Still blocking the 0.1.0 tag).
**Context:** Per priority-release-010.md § Open → close, size-strict debt was closed 2026-08-12 but regressed by growth. Per open-inflight.md § Still blocking the 0.1.0 tag (2026-09-11 core-finalization wave), size-strict must be back under ceiling before A9. quick-wins merge was approved with `--force` because of `src/routes/chats/manage.ts` (251L), `src/frontend/alpine/chat/index.ts` (251L), `src/frontend/alpine/chat-types/core.ts` (253L) — these are the seed over-limit files.

## Files over 250L (baseline 2026-09-26)

| File | Lines | Suggested split |
| --- | --- | --- |
| src/routes/chats/manage.ts | 251 | routes/chats/manage/{crud,participants,mutations}.ts |
| src/frontend/alpine/chat/index.ts | 251 | alpine/chat/{state,events,actions}.ts |
| src/frontend/alpine/chat-types/core.ts | 253 | chat-types/{core,message,participant}.ts |

**Acceptance Criteria:**

- [ ] All three files split; each resulting file ≤ 250L.
- [ ] `bun run check` exits 0; size-strict gate green.
- [ ] `bun test src/routes/chats/ src/frontend/alpine/` green.
- [ ] No behavior change; verify via existing test suites that depend on these files.
- [ ] Verification log captured in ticket log.

**Tags:** size-strict, regression, refactor, release-010, a9
**Related:** .plan/backlog/open-debt.md § Release hardening, .plan/tickets/TASK-size-strict-debt.md, .plan/backlog/priority-release-010.md


git issue: d5ffa23
