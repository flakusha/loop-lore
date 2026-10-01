<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# .tmp janitor gate + verified-at staleness markers

**Status:** Done
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Superseded before implementation - re-measurement found 3 of the 4 metrics at zero, and the one real growth bucket is already GC'd by the app.
**Context:** Premise measured stale. Re-measured 2026-10-01 on the dev checkout: 0 orphan `*.lcov.info.*.tmp` (was 47 / 49.1 MB), oldest artifact 0.1d (was 16d), 1 unreferenced `.tmp/*.md` (was 16). The growth is in `.tmp/async-store/`, swept by `pruneOrphanSpills` on a 24h TTL. The deletion side this ticket deferred to (`giwt clean`) has shipped and reports 0 candidates here.
**Acceptance Criteria:** AC #5 is unsatisfiable as written - it requires the rollup to reproduce figures that no longer exist. See Resolution.

## Summary

`.tmp/` carries **99 MB across 1177 files** (scratchpad §1, baseline measured 2026-09-26 in the parent checkout). The single-largest waste is 47 orphan `*.lcov.info.*.tmp` files totalling **49.1 MB** (P-01); the oldest artifact in `.tmp/async-store/` is **16 days** old (P-03); **16 analysis `.md` documents have zero inbound references from `.plan/`, `docs/`, or `src/`** (P-05) and are invisible to the discovery-by-`grep .plan/` workflow; and stale logs keep steering conclusions (P-13 — `.tmp/test-run2.log` reports 255 Elysia route-collision errors that `src/routes/messages/forward.ts:53` proves are fixed). This ticket adds (1) a **read-only advisory `.tmp` janitor** wired into `runNonBlockingChecks` so the four metrics are visible alongside every other gate, and (2) a `<!-- verified-at: <sha> -->` header convention for `.tmp` markdown analysis docs plus a small `scripts/check-staleness.ts` that warns when the recorded sha is behind HEAD by > 100 commits. **No deletion in this ticket** — deletion is G-3 in giwt (separate concern, opt-in).

## Repro / Current state

Measured in the parent checkout, 2026-09-26 (this worktree's `.tmp/` is freshly seeded at 38 KB / 0 files because it branches from `dev`):

| Bucket | Size | Files | Source |
|---|---:|---:|---|
| Total `.tmp/` | 99 MB | 1177 | §1 inventory |
| Orphan `*.lcov.info.*.tmp` (P-01) | **49.1 MB** | **47** | §2 P-01 |
| Oldest `.tmp` artifact (`async-store/`) | 16 days (2026-09-10 → 2026-09-26) | — | §2 P-03, §7 row 8 |
| `.tmp` markdown with **zero `.plan/` references** (P-05) | — | **16** (basenames verified by exact match) | §2 P-05 |
| `.tmp/jscpd-report.json` per-run copies (P-02) | 11.0 MB | 4 | §1 |
| `.tmp/async-store/` (runtime spill, no GC) | 18 MB | 279 | §2 P-03, D-04 |
| `.tmp/giwt/runs/` at default `runlog.max_runs = 200` | 996 KB | 200 | §1 |
| `.tmp/check-report-*.json` (per-run, retention 20) | — | 21 | §1 |

`runNonBlockingChecks` lives at `scripts/check-parallel.mjs:1119`. The jscpd step (1167-1231), license step (~1263-1290), and `md:links` step are already inside it; the janitor slot is the natural place — **between license and `md:links`** so it appears next to other cross-cutting health signals.

`scripts/check-parallel.mjs:963-992` (`pruneRunScratchDirs`) shows the project's existing precedent for bounded retention; the janitor mirrors its reporting style but is read-only.

## Fix shape

### 3.1 `.tmp` janitor (advisory)

New step in `runNonBlockingChecks` reporting four metrics:

1. **Total `.tmp/` bytes**: `du -sb .tmp/ 2>/dev/null` (or `Bun.file(path).size` summed under `readdirSync`). Reported as `info` with the byte count.
2. **Orphan `*.lcov.info.*.tmp` count**: `find .tmp/ -name '*.lcov.info.*.tmp' | wc -l`. Reported as `info` (not warn — the volume is informational; deletion is G-3).
3. **Oldest `.tmp` artifact mtime**: scan `readdirSync('.tmp/', { recursive: true, withFileTypes: true })`, take the minimum `mtimeMs`, report age in days. Reported as `info`.
4. **`.tmp` markdown files with zero `.plan/` references**: for each `*.md` directly under `.tmp/` (depth 1), grep the basename across `.plan/`, `docs/`, `src/`. Report the count of unreferenced docs as `info` (today: 16).

All four lines emit at `level: "info"`. The step is **advisory only** — non-blocking. Output lines look like:

```
info: .tmp janitor: 99.0 MB total, 47 orphan *.lcov.info.*.tmp, oldest artifact 16d, 16 markdown docs unreferenced by .plan/
```

The script may live inlined inside `check-parallel.mjs` (matching the jscpd/license step style) or as a small `scripts/check/tmp-janitor.ts` helper invoked via `Bun.spawn`. The latter is preferred for testability.

### 3.2 `verified-at:` staleness convention

Header syntax (HTML comment, parsable without breaking markdown):

```markdown
<!-- verified-at: a4e98136658e -->

# My analysis doc title
```

The convention applies only to `.tmp/*.md` **analysis documents** (not runtime/builder artifacts). Authors add the header after the next `git rev-parse --short HEAD` at write-time.

`scripts/check-staleness.ts`:
1. Find every `*.md` directly under `.tmp/` (depth 1).
2. For each, parse the first HTML comment for `verified-at: <sha-or-tag>`.
3. Compare to `git rev-parse --short HEAD` of the worktree.
4. Run `git rev-list --count <recorded-sha>..HEAD`; if `> 100`, emit `warn: stale .tmp/<file>: verified at <sha>, now <N> commits behind`.

The script also handles **missing** headers (warn-once at `info`: `info: .tmp/<file> missing verified-at header — add <!-- verified-at: $(git rev-parse --short HEAD) -->`).

It runs as a separate `bun run check:staleness` script (matches the `bun run md:links` style), and is invoked by `runNonBlockingChecks` next to the janitor.

### 3.3 Deletion is NOT in this ticket

The janitor is read-only. The actual deletion is `giwt clean [--dry-run]` (G-3 in `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.1), a separate opt-in tool that needs a documented default config (loop-lore has no `giwt.toml`). This ticket **only** reports the numbers; it never `rm`s anything.


## Resolution (2026-10-01)

Re-measured the four metrics on the dev checkout before implementing. Three
no longer exist, and the fourth is owned elsewhere:

| Metric | Ticket baseline (2026-09-26) | Measured (2026-10-01) |
|---|---:|---:|
| Total `.tmp/` | 99 MB | ~165 MB |
| Orphan `*.lcov.info.*.tmp` (P-01) | 47 files / 49.1 MB | **0** |
| Oldest `.tmp` artifact | 16 days | **0.1 days** |
| `.tmp` md unreferenced by `.plan/` | 16 | **1** |

**The growth is in `.tmp/async-store/`, and it is already GC'd.** That is the
spill directory for the async response store. It is swept by
`pruneOrphanSpills` (`src/async/spill-retention.ts`), reached from
`runOffloadPass` (`src/async/offload.ts:158`) on a 24h TTL. Every file in it
was under an hour old at measurement time - live writes, not accumulation.

It is deliberately invisible to `giwt clean`. `scanScratch`
(`giwt/src/utils/scratch.ts:176`) classifies only `*.tmp` files, `cov-*`
dirs, `jscpd-report.json`, and root-level `check-report*.json`; spill files
are `<id>.json.gz` and match no class. **That is correct, not a gap** - a
spill file is only garbage once no DB row references it, and
`pruneOrphanSpills` is the only thing that can make that call. A
name-pattern janitor over the same tree would delete live spill files and
reproduce the data loss in
BUG-async-spill-uses-cache-key-as-filename-so-routed-ids-lose.

**The deletion side this ticket deferred to has shipped.** `giwt clean`
exists with dry-run-by-default, `--apply`, per-class age/size caps, and tests.
Against this checkout it reports 0 candidates, which is the correct state.

### Why not implement

- AC #5 is unsatisfiable as written: it requires the rollup to read
  `47 orphan *.lcov.info.*.tmp ... oldest artifact 16d, 16 markdown docs`.
  Those are now 0, 0.1d, and 1. A gate that can no longer be verified against
  its own acceptance criteria is a gate nobody trusts.
- A read-only advisory step reporting zeros costs a gate slot and a
  `runNonBlockingChecks` branch forever. The signal it would carry is that
  nothing is wrong.
- The `verified-at:` convention has no candidate population: one depth-1
  `.tmp` markdown file exists, and it is the active batch-verification note,
  not a stale artifact.

If `.tmp/async-store/` ever does accumulate past its 24h TTL, that is a bug
in `pruneOrphanSpills` or in the daemon's `runOnce` wiring, not a missing
janitor. File it there.

## Follow-up ruled out

`giwt clean` does not enumerate `.tmp/async-store/`. Do not "fix" this by
adding a spill-file class to `scanScratch` - see the data-loss note above.
That directory belongs to the app, under the app's GC, with
row-reference semantics `giwt` has no way to see.

## Acceptance Criteria

1. **Janitor step runs and reports all four metrics**: trigger via `bun run check`; grep the output for the four info lines above (or the equivalent `.tmp janitor: …` single-line rollup); none of them block.
2. **Janitor is read-only**: confirm no `unlinkSync` / `rmSync` / `rm` calls added; `git status` after a check run shows no `.tmp` files removed.
3. **`verified-at:` header is parsed**: place a `<!-- verified-at: $(git rev-parse --short HEAD~200) -->` in a temporary `.tmp/_test-stale.md`; run `bun run check:staleness`; it emits `warn: stale .tmp/_test-stale.md: verified at <sha>, now 200 commits behind`. Remove the file after.
4. **Missing header is non-blocking**: an unannotated `.tmp` markdown file produces an `info:` (not `warn:`) line and does not affect exit code.
5. **Numbers match the baseline**: on the parent checkout, the rollup line reads `99.0 MB total, 47 orphan *.lcov.info.*.tmp, oldest artifact 16d, 16 markdown docs unreferenced by .plan/` (the four P-01/P-03/P-05 figures from the scratchpad). **Not satisfiable as of 2026-10-01** - those figures no longer hold; see Resolution.
6. **CI-safe — no deletion**: `git status` after running the new step reports zero modifications outside `.tmp/_test-stale.md` (the throwaway test artifact from criterion 3, which the test cleans up itself).

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §2 P-05 (16 zero-ref docs — janitor metric #4)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §2 P-13 (stale logs steering conclusions — `verified-at:` is the fix)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.3 L-5 (janitor gate canonical proposition)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.3 L-9 (staleness marker convention)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.1 G-3 (`giwt clean [--dry-run]` — the deletion side; **not** in this ticket)

git issue: f6100ba
