<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Harness RSI repo-root access tier

**Overview:** (see sections below)

**Status:** In Progress (first slice landed on branch `rsi-repo-access`)
**Status Note:** Promoted from evaluated research `.tmp/research/HarnessRSI-RepoAccess.md` + `.tmp/research/RSI-RepoAccess-EVALUATION.md` — amended per RSI-RepoAccess-EVALUATION Part 4; provisional defaults marked inline. First slice delivered (2026-11-11, `rsi-repo-access` worktree): typed capability vocabulary + principal-aware scope resolver/guard + fail-closed execution gate + escalation audit + operator master switch (file + admin override, default OFF) + facade `repo-access` domain ops (`repo.context`, `repo.check`). Still open: grant persistence on `chat_branches` (migration, absorbs TASK-harness-delegated-permission-grants), the admin approval-queue surface for escalations, the internal-service credential bootstrap, and the project-space root resolver (blocked below).
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** rsi, repo-access, principal, scope-guard, capability-grants, escalation, audit, internal-service
**Depends on:** epic-principal-scoped-credentials.md, epic-project-spaces-pm-integration.md, epic-recursive-self-improvement.md
**Related Epics:** epic-principal-scoped-credentials.md, epic-harness-integration.md, epic-recursive-self-improvement.md, epic-project-spaces-pm-integration.md, epic-security-sandboxing.md

## Summary

Add a repo-root access tier for RSI (epic-recursive-self-improvement) without weakening user isolation. The worktree-scope guard (`src/harness/worktree-scope.ts`) today has ONE root and ONE escalation bit and no identity tier; this epic makes it principal-aware with server-issued principals, capability grants, an audited escalation queue, and an `internal-service` bootstrap principal holding repo-root scope.

## Trust boundary

- The principal is NEVER caller-supplied: tool params / chat context can never assert kind; the principal is resolved server-side from a verified credential at one assertion point; `assertParamsWithinScope` takes a server-issued principal object. AC: a param-supplied principal is ignored.
- Credential/principal resolution extends the verified existing auth seam (`authenticate()` derive + `requireAuthGuard` fail-closed pipeline, `elysia-app.ts:107-154`) — not a parallel auth path. The shared primitive lives in `epic-principal-scoped-credentials.md`.
- `PrincipalKind` = `user | user-worktree | internal-service | external-agent` (renamed from draft `lolo`: that is the shipped CLI binary / client identity). `internal-service` maps to an `actors` row with `actor_type: "system"`; `userRole` remains the RBAC vocabulary.

## Design

### Scope-root resolution

- `user` / `user-worktree`: pass-through — root resolved from the explicit `root` param (current behavior) until project spaces land (provisional — owner may override, see DECISIONS); `epic-project-spaces-pm-integration` is a hard prerequisite for the real user-kind resolver.
- `internal-service`: repo worktree root (git toplevel) — the only principal that may touch `src/`, `.plan/`, migrations, workflows.
- `external-agent`: confined to its assigned agent worktree (`tree/agent-<uuid>/`), never repo root.

### Capability grants

Spawn-time grants persisted on chat_branches; this epic ABSORBS `TASK-harness-delegated-permission-grants` (one owner for the migration surface). Vocabulary (typed constants module, `HARNESS_TIERS` runtime-list precedent): `repo:write`, `worktree:spawn`, `check:run`, `commit:signed`, `finalize:merge`, `ticket:ops`. `repo:read` is pruned — implied by worktree access. Effort Medium-High.

### Escalation + audit

`request_root_change` becomes a recorded request + admin approval queue, default deny, NO auto-approve for any principal (`internal-service` holds grants; no escalation flow). Context: `requestRootChange` is plumbed but set by no production caller today — default-deny is the only live behavior. Audit rows extend the EXISTING `tool_call_audit` table (migration 092, has `verdict`/`required_role`/`escalation_attempt`) rather than a new `agent_actions` table (provisional — owner may override).

### Write path

Repo-root writes go through worktree + finalize like external agents (provisional — owner may override); direct-to-dev reserved for watchdog self-heal hotfixes only.

## Tasks

- [x] Scope resolver on shared principal kind (user-kind pass-through-until-spaces) — `resolveScopeRoot` `src/integrations/harness/repo-access/principal-scope.ts` (internal-service → git toplevel with fail-closed detection, user/user-worktree → explicit-root pass-through, external-agent → realpath-verified `tree/agent-<id>/` confinement); matrix tests `principal-scope.test.ts`
- [x] Principal-aware scope guard (server-issued principal; param-supplied principal ignored) — `assertParamsWithinPrincipalScope` takes the principal as a server-side argument and never reads it from params; AC asserted in `principal-scope.test.ts` ("a param-supplied principal is IGNORED")
- [ ] Project-space root resolver (BLOCKED-BY epic-project-spaces-pm-integration)
- [ ] Capability grant model (absorbs TASK-harness-delegated-permission-grants; typed constants; db:sync gates in AC) — PARTIAL: typed constants `HARNESS_REPO_CAPABILITIES` (`repo-access/capabilities.ts`) + per-kind defaults and fail-closed intersection (`repo-access/grants.ts`) + gate enforcement landed; the `chat_branches` spawn-time persistence migration is the remaining half
- [ ] Escalation audit (recorded request in tool_call_audit + admin approval queue; no auto-approve) — PARTIAL: `requestRepoRootChange` records `escalation_attempt = 1` denials into `tool_call_audit` (migration 092 reused, no new table; `repo-access/gate.ts`) with NO auto-approve for any principal; the admin approval queue (list/approve surface) is the remaining half
- [ ] internal-service bootstrap (grants-based principal; credentials via shared seam) — PARTIAL: the grants-based admission exists (kind gate + defaults holding all capabilities); the credential issuance through the shared auth seam is the remaining half
- [x] Agent API boundary enforcement (default-deny BEFORE any principal exists; no bootstrap dependency) — the gate's first check is the operator master switch (unseeded store reads disabled → every execution denied with zero principal/bootstrap), and the facade `repo-access` domain is kind-refused in `authorizeFacadeOp` (`loop-lore-facade/authz.ts`) before any handler runs; the future `/api/v1/agent/*` routes inherit the seam via the gate
- [x] Isolation test matrix (parallel-safe resource contract) — `repo-access/*.test.ts` + `loop-lore-facade/ops-repo-access.test.ts`: :memory: DB per file, mkdtemp roots via detector seam, unique principals per test; covers user ✗ repo root, external-agent ✗ own-worktree escapes/symlinks/other agents' worktrees, internal-service ✓ only when operator-enabled, escalation always denied
- [x] Docs + typed capability constants — security-boundary module docs on every `repo-access/` module + core config schema docs (`RepoAccessConfig`), constants in `capabilities.ts`

## Non-goals

- No container/worker isolation (epic-security-sandboxing).
- No change to user project-space semantics.
- No removal of the worktree-scope guard (make it principal-aware).
- No repo write for end users or external agents.
- No new `agent_actions` table (extend `tool_call_audit`).

## Dependencies

Depends on `epic-principal-scoped-credentials.md` (PrincipalKind + credential seam), `epic-project-spaces-pm-integration.md` (user-kind resolver prerequisite), `epic-recursive-self-improvement.md` (agent API surface).

## Related Epics

`epic-principal-scoped-credentials.md`, `epic-harness-integration.md`, `epic-recursive-self-improvement.md`, `epic-project-spaces-pm-integration.md`, `epic-security-sandboxing.md`.

## DECISIONS (owner questions pending — RSI-RepoAccess-EVALUATION §5)

- §5 Q2 internal-service runtime shape (in-process vs supervised): OPEN.
- §5 Q3 write path: worktree+finalize adopted (provisional).
- §5 Q4 credentials story: OPEN.
- §5 Q5 project-spaces sequencing: pass-through-until-spaces adopted (provisional).
- §5 Q6 approval-queue surface (admin UI vs notifications): OPEN.


git issue: 6a37972
