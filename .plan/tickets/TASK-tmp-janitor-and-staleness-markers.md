<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# .tmp janitor gate + verified-at staleness markers

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task

**Summary:** `.tmp/` carries **99 MB across 1177 files** (scratchpad §1, baseline measured 2026-09-26 in the parent checkout). The single-largest waste is 47 orphan `*.lcov.info.*.tmp` files totalling **49.1 MB** (P-01); the oldest artifact in `.tmp/async-store/` is **16 days** old (P-03); **16 analysis `.md` documents have zero inbound references from `.plan/`, `docs/`, or `src/`** (P-05) and are invisible to the discovery-by-`grep .plan/` workflow; and stale logs keep steering conclusions (P-13 — `.tmp/test-run2.log` reports 255 Elysia route-collision errors that `src/routes/messages/forward.ts:53` proves are fixed). This ticket adds (1) a **read-only advisory `.tmp` janitor** wired into `runNonBlockingChecks` so the four metrics are visible alongside every other gate, and (2) a `<!-- verified-at: <sha> -->` header convention for `.tmp` markdown analysis docs plus a small `scripts/check-staleness.ts` that warns when the recorded sha is behind HEAD by > 100 commits. **No deletion in this ticket** — deletion is G-3 in giwt (separate concern, opt-in).

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
**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
