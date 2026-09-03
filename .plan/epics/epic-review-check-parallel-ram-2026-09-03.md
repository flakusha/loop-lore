<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Review — `bun run check` RAM Footprint (2026-09-03)

## Status: Resolved (informational, no action required)

**Priority:** Low
**Labels:** review, tooling, performance, ram

## Summary

Empirical review of `bun run check` memory consumption, prompted by concern
that running the gate concurrently across multiple worktrees could exhaust
host RAM. The concern is real but the dominant cause is **per-check ESLint
concurrency**, not cross-worktree multiplication.

## Overview

The check runner (`scripts/check-parallel.mjs`) currently fires ~24 checks in
parallel within one worktree. The `--jobs N` cap added in commit `f2deabc5`
chunks them into N-wide waves; per-worktree wall time improved (~21% on this
host) but peak RSS did **not** drop as the commit message claims — the
bottleneck is `lint:eslint`, which is configured at `--concurrency=8` in
`package.json` and dominates the resident-set regardless of how many *other*
checks co-run.

## Current State (qualitative)

| Surface | State |
|---|---|
| Intra-worktree concurrency cap | ✅ present (`--jobs 4` default, env/flag override) |
| Duplicate ESLint check entry | ✅ removed (commit `f2deabc5`) |
| `Promise.all` over all checks | ✅ replaced with chunked `Promise.allSettled` |
| Cross-worktree coordinator | ❌ absent (intentional; not needed) |
| ESLint `--concurrency` | ⚠️ **unbounded** — single biggest RAM driver |
| Peak RSS for full `bun run check` on 64 GB machine | ⚠️ **near ESLint single-check peak** (no headroom for many worktrees) |
| Wall time for full `bun run check` | ✅ improved with `--jobs` (~21% faster on this host) |
| 24 check outcomes | 21 pass / 3 fail — pre-existing failures (`typecheck - backend`, `lint - eslint`, `format - dprint`), unrelated to this review |

## Method

- Measured full `bun run check` peak RSS via `/usr/bin/time -v` on this host
  (61 GiB / 32 cores) before and after commit `f2deabc5`.
- Measured each heavy check in isolation to attribute the peak.
- Verified `bunx eslint --concurrency=N .` peak at N=8 and N=4 to confirm the
  concurrency lever.

## Findings

1. **ESLint `--concurrency=8` is the dominant RSS consumer.** Single
   `bunx eslint --concurrency=8 .` peak ≈ 11 GB on this project; `--concurrency=4`
   peak ≈ 7 GB. Roughly a third reduction by halving the worker count, with
   negligible wall-time penalty on this machine.
2. **`--jobs 4` chunking does not bound peak RSS materially.** Pre- and
   post-`f2deabc5` peaks for full `bun run check` are within a few GB of the
   ESLint single-check peak. The commit message's "1/6 of historical
   behaviour" claim was not borne out on this workload; the practical effect
   is wall-time improvement, not RAM reduction.
3. **The OOM concern at 3-5+ concurrent worktrees is real on smaller hosts.**
   On a 64 GB machine, two worktrees already approach the budget. A third or
   fourth would swap. The combination of `--jobs 4` + `lint:eslint
   --concurrency=4` keeps peak per-worktree comfortably under 8 GB and lifts
   the host ceiling to ~6 concurrent worktrees on 64 GB.
4. **No cross-worktree coordinator is warranted.** The intra-worktree
   `--jobs` cap plus a reasonable `--concurrency` on the heavy checks solves
   the same problem at a fraction of the engineering cost of a daemon.

## Recommendations (informational, no follow-up tickets filed)

- **`package.json` `lint:eslint`** — consider `--concurrency=4` instead of 8.
  Single biggest RAM lever. Wall-time impact on this machine is small.
- **Cross-worktree concurrency** — capped at 4 by `--jobs` default. Override
  per-tree with `CHECK_JOBS=2` on shared CI runners.
- **Commit message polish** — `f2deabc5`'s "peak RSS drops to ~1/6" claim is
  empirically wrong on this workload; the actual win is wall-time. Doc-only
  note; no amend needed (per user direction: documentation suffices).

## Non-goals

- Implementing the `lint:eslint --concurrency` change — owner decision;
  not in scope for this review.
- Building a cross-worktree coordinator — out of scope; `--jobs` cap is
  sufficient.
- Investigating the three pre-existing check failures (`typecheck - backend`,
  `lint - eslint`, `format - dprint`) — unrelated, owned elsewhere.

## Related

- `f2deabc5 perf(check): cap parallel runner at 4 jobs to keep peak RSS
  bounded across worktrees`
- `scripts/check-parallel.mjs` — current runner
- `package.json` — `lint:eslint` script with `--concurrency=8`
- `.plan/epics/epic-tooling-improvement.md` — parent epic
- `.plan/epics/epic-review-dev-2026-08-26-late-merges.md` — prior review
  format reference