<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-sandbox-root-knob-configurable-cwd

**Status:** Not Started
**Blocker:** HELD — unlanded branch `harness-sandbox-root-knob` (`d886c680d` per-profile `sandboxRoot`; `runtime.ts` + tests only, no `src/config` knob yet per branch stat). Next: land the branch, then flip this ticket with the landing sha.
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add a sandbox-root config knob: the permission classifier (`permission-policy.ts:149-183`), worktree guard (`worktree-scope.ts:93-158`), and read-only tree (`files.ts:54-131` + route `index.ts:138-166`) are all shipped, but there is no `sandboxRoot`/`cwd`/`rootDir` knob anywhere under `src/config` — the root is always `process.cwd()` (`runtime.ts:113` fallback). Tool-sandbox execution isolation stays in `TASK-harness-tool-sandbox` (Not Started, epic-harness-integration); this ticket is the one-line config seam, not the isolation boundary.

**Context:**

## Why

Parity matrix gap #5 (PARTIAL): per-run cwd exists at the permission-queue seam (`permissions.submit({ sandboxRoot })`) but nothing configures it — every session runs in the server cwd. Operators cannot scope a harness profile to a worktree or a data dir, so the classifier's inside/outside verdicts all anchor to one directory.

## Scope

- `sandboxRoot` (or `cwd`) knob on the harness/ACP profile config with validation (must exist, must be a directory, resolved absolute; reject traversal at config load, mirroring `isWithin` semantics).
- Thread it through `createHarnessRuntime` so `onPermissionRequest` uses the configured root instead of `opts?.cwd ?? process.cwd()` (`runtime.ts:113`).
- Document the default (cwd, unchanged behavior when unset).

## Do NOT touch

- Do NOT build the tool-execution isolation boundary (that is `TASK-harness-tool-sandbox`).
- Do NOT change classifier verdict semantics — only where the root comes from.

**Acceptance Criteria:**

- [ ] Config knob sets the sandbox root per profile (or globally); unset preserves current `process.cwd()` behavior.
- [ ] Invalid roots (missing, not-a-directory, traversal) fail closed at config validation with a named error.
- [ ] Unit test proving `onPermissionRequest` receives the configured root.
- [ ] Unit test proving `onPermissionRequest` receives the configured root.

## Dedup-note (2026-11-07 triage)

- DUPLICATE: `harness-sandbox-root-knob` (d886c680d) and `harness-dispatch-path` (ca3f1d09, knob commit ca3f1d096) implement the same `harness.acp.profiles[].sandboxRoot` knob: same schema field, same fail-closed `validateSandboxRoot`, same runtime threading in `createHarnessRuntime`.
- WINNER: `harness-dispatch-path` — its knob commit is the superset: it also hands the resolved root to the adapter as the session `cwd` (classifier verdicts and session cwd cannot drift) and exposes the queue-wrapped `factory` on the runtime (needed by approval-flow callers). It rides with the dispatch + turn-persistence stack already queued for landing.
- LOSER DROPS: do NOT land `harness-sandbox-root-knob` separately. After the dispatch branch lands, drop its knob commit (rebase onto dev, or delete the branch).
- Note: the HELD Blocker line above is stale — the knob branch DOES carry the `src/config` knob (`sections/harness.ts` +45), not just runtime + tests.
