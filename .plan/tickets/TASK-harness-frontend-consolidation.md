<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness frontend consolidation (admin Runs tab)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** New "Harness"/"Runs" tab in admin.html reusing the admin shell + existing patterns; TUI gains dispatch verbs as command-registry entries (zero TUI rewrite); harness HTTP reads are an upgrade path only.
**Context:** `src/views/` (22 files, auto-discovered via `plugin-pages.ts` + `serveView`, `adminViewGuard`); admin.html has 13 tabs; `src/routes/admin/` has 15 sub-routes (`admin/index.ts:49-63`); agency `spend.ts` is game currency (reuse the ledger pattern, not the unit); TUI is a thin HTTP client (`tui/app.ts`, chat widget POSTs `/api/chats/:id/messages`); dispatch hook already server-side (`routes/messages/command.ts` dispatchCommand → workflow-routing → runner + session-store 24h TTL).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] "Harness"/"Runs" tab in `admin.html` (stat cards, run/approval/budget/trace tables, activity feed) reusing admin shell + `adminViewGuard`; handlers beside existing sub-routes in `admin/index.ts` (follow `audit.ts`/`cron.ts` shape); search/filter reuses `frontend/pages/shared.ts`; in-flight polling reuses `use-request-status.ts`.
- [ ] `orchestrate`/`workflowz`/`omp` verbs as new `assistant/commands/registry.ts` entries reusing `confirmAndDispatch` + session-store TTL; prompt assembly via `PromptAssembler` PROMPT_SECTIONS (never hand-rolled strings); `agency/` BDI untouched.
- [ ] Upgrade path (only if CLI proves insufficient): GET `/api/harness/conflicts|issues|prs|diff` reusing the same formatter fns (one format fn, two sinks) — not a second implementation.
- [ ] Related epics cross-linked, not absorbed: `epic-mobile-app.md`, `epic-desktop-app.md`, `epic-headless-alternative-frontends.md`.

## Related Files

- `src/views/admin.html`, `src/routes/admin/`, `src/frontend/pages/shared.ts`, `src/frontend/alpine/use-request-status.ts`
- `src/assistant/commands/registry.ts`, `workflow.ts`, `workflow-runner.ts`, `workflow-session-store.ts`, `src/routes/messages/command.ts`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
