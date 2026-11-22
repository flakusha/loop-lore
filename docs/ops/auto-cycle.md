<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Autonomous development cycle (slice 1: policy)

Slice 1 ships four pure functions and their tests. It does **not** claim lanes,
spawn agents, sleep, commit or finalize. The driver that acts on these decisions
is slice 2 and is not enabled by this document.

## Files

| Path | Role |
|---|---|
| `scripts/auto-cycle-policy.ts` | pure `eligibility`, `selectModel`, `backoffMs`, `summaryContract` |
| `scripts/auto-cycle-policy.test.ts` | deterministic tests; owns no resource |
| `.tmp/intercom/AUTO.json` (scratch, operator-created) | `autoflag`, scope and limits |

## Minimal loop contract (for slice 2)

1. Read `.tmp/intercom/AUTO.json` if it exists; otherwise require a natural-language
   trigger. `autoflag` defaults to `off`.
2. Discover a ticket via `giwt plan report --json` (or `giwt plan status --tickets --json`), score it
   with `bun run plan:lint-briefing <id>` and filter with `eligibility`:
   require an explicit lane, no active claim, acceptance criteria, score ≥ 3.
3. Read prior history before acting: `engram` context, `.omp/receipt.toml`,
   `giwt ledger show`, `.tmp/intercom/FIXED-*.md`, `.tmp/research/`.
4. File/update tickets with `giwt new <branch> --tickets <csv>`, `giwt sync --fix`, and `giwt plan validate --fix`.
5. Claim with `giwt intercom claim <lane> --owner <agent-id> --scope "<text>"`.
6. Open a worktree via pinned `bun node_modules/giwt/src/cli.ts new <branch> --scope <id>`
   (never bare `giwt`). Work inside `tree/<branch>/`.
7. Implement with small subagents; each writes its partial state to FIXED before
   termination. Review, patch, confirm with scoped gates.
8. Rebase via `giwt rebase --onto <target>`; finalize via `giwt finalize <branch>`.
   Slice 1 never calls either.

## `AUTO.json` defaults (scratch file, operator-owned)

```json
{
  "autoflag": false,
  "targetBranch": "dev",
  "maxLanes": 1,
  "maxBudgetUsd": 2,
  "allowedProviders": ["harness"],
  "stopConditions": ["quota-exhausted", "gate-red", "no-eligible-ticket", "decision-needed"]
}
```

No repo config, CLI flag or schema is added in slice 1. The file is ignored
scratch state; a later slice may promote it to a real config home after an
operator decision.

## Model/provider selection precedence

`user pin > task-modality map > observed success/breaker > cache hit > safe default`.
`selectModel` returns a tier only (`good`/`fast`); concrete profile selection and
`GLOBAL_PROVIDER` checks stay in harness. Good tier: planning, design, review.
Fast tier: implementation, debugging, testing, finalization, research. Unknown
modalities default to good unless a cached verdict makes fast sufficient.
A tripped profile breaker is a hard skip at dispatch, not a permanent demotion.

## Quota and backoff

`backoffMs(attempt, retryAtMs, now)` reuses `restartBackoffMs` and
`SUPERVISION_MAX_RESTARTS` from `src/services/server-external-manager/supervise.ts`.
Jitter is fixed at 1 inside the policy for determinism; the caller supplies the
real jitter when it dispatches. `retryAtMs` comes from the harness `_omp/usage` quota probe (quota reset
epoch-ms) or is null. Wait is `max(backoff, retryAtMs - now)`. Attempt 5 returns
`exhausted` — stop the loop, keep the resume point, do not call the direct API.

## Kill-with-summary protocol

Before killing a stray subagent, collect its lane, task id, branch, worktree,
status + diff-stat, commits, gate results, files touched, residuals, next step
and spend/time. `summaryContract` renders exactly those fields as an append-only
`## INTERRUPTED` section; the caller writes it to `FIXED-<lane>.md` with a
timestamp. Missing fields are explicitly `(none recorded)` — never silently
dropped. Budget is preserved because the summary is written before termination.

## Stop conditions

No eligible ticket (bad briefing score, claimed lane, missing decision), provider
quota exhausted and backoff cap reached, hard gate failure after a scoped fix
attempt, finalize refused on red gates, operator flag off. On stop: append FIXED,
clear the lane claim, leave the worktree for human review.

## Explicit scope cuts

No scheduler, no auto-finalize, no direct API fallback, no new config schema,
no provider adapters, no engram writes from the policy module.

## Verification

```bash
bun test scripts/auto-cycle-policy.test.ts   # deterministic, no shared state
bun run typecheck                            # repo TS gate
```