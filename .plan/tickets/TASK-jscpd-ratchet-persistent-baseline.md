<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# jscpd ratchet: persist baseline, gate on rising clones/dup-%

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** Persist a committed `.jscpd-baseline.json`, gate the check on rising clones or dup-%, expose `bun run jscpd:baseline` as the only sanctioned way to raise the bar.
**Context:** `scripts/check-parallel.mjs:1167-1231` overwrites `.tmp/jscpd/prev.json` every run (git-ignored); observed 3003 → 3005 silent creep between 2026-09-25 and 2026-09-26 with no gate trip.
**Acceptance Criteria:** [see body — committed baseline, blocking error on regression, opt-in baseline script, drop the `.tmp/jscpd/prev.json` write path]

## Summary

The jscpd step (`scripts/check-parallel.mjs:1167-1231`) compares the current run against `.tmp/jscpd/prev.json` and overwrites it every run, so the comparison spans **one run only**. Observed drift in `.tmp/check-report.json` (line ~262): 3003 clones on 2026-09-25 (first run, baseline recorded) → 3005 clones on 2026-09-26 (reported as `level: "info"` non-blocking, message "unchanged vs last run"). The 09-18 gate audit (`grep -c -i 'jscpd\|clone' .tmp/heavy-gate-audit-2026-09-18.md` = 0) never mentions jscpd at all — silent debt. This ticket adds a **committed, long-lived** `.jscpd-baseline.json` at the repo root, gates the check on rising clones OR dup-%, and exposes `bun run jscpd:baseline` as the intentional opt-in to raise the bar.

## Repro / Current state

Current step (excerpt — `scripts/check-parallel.mjs:1195-1216`):

```js
// prev.json behind (we don't compare per-RUN counts — jscpd output is
// a property of the source tree, which is stable across runs in the
// same checkout).
let trend = " (first run: baseline recorded)";
const baselineDir = path.resolve(PROJECT_ROOT, ".tmp/jscpd",);
const prevPath = path.resolve(baselineDir, "prev.json",);
try {
  const prev = JSON.parse(readFileSync(prevPath, "utf8",),);
  const delta = cloneCount - prev.clones;
  trend = delta === 0
    ? " (unchanged vs last run)"
    : delta > 0
    ? ` (+${delta} clones vs last run, warning)`
    : ` (${delta} clones vs last run, ok)`;
} catch {
  // no previous report in this checkout — baseline gets recorded below
}
mkdirSync(baselineDir, { recursive: true, },);
writeFileSync(
  prevPath,
  `${JSON.stringify({ clones: cloneCount, generatedAt: new Date().toISOString(), },)}\n`,
  "utf8",
);
```

Two problems in this block:
1. **`prev.json` is overwritten every run** (line 1215) → the "vs last run" comparison is by definition a single-run delta; a 30-day silent creep from 3003 → 3500 reads as a series of small "vs last run" hops and never trips.
2. **`prev.json` is git-ignored** under `.tmp/` → no long-lived, reviewable baseline exists. The next person who deletes `.tmp/` loses the comparison entirely.

Empirical observed values (per scratchpad §2 P-10):
- `finalize3.log`, 2026-09-25: **3003 clones / 9.05% dup lines** — message "first run: baseline recorded".
- `.tmp/check-report.json`, 2026-09-26: **3005 clones / 9.05%** — message "unchanged vs last run".
- `level: "info"`, non-blocking. No consumer fails when the number rises.

## Fix shape

1. **Committed baseline file**: `.jscpd-baseline.json` at the repo root with shape:

   ```json
   {
     "clones": 3005,
     "dupPercent": 9.05,
     "recordedAt": "2026-09-26T03:25:46.800Z"
   }
   ```

   The file is **committed** (in `.gitignore`'s allow-list, or just non-ignored — confirm via `git check-ignore -v .jscpd-baseline.json` and lift the rule if needed).

2. **Gate logic** in `scripts/check-parallel.mjs:1167-1231`:
   - Read `.jscpd-baseline.json` from `PROJECT_ROOT` (NOT `.tmp/jscpd/prev.json`).
   - If `clones > baseline.clones` **OR** `dupPercent > baseline.dupPercent + 0.5`, emit `level: "error"` (blocking) with a one-line diff: `jscpd ratchet: clones 3005 → 3010 (+5); dupPercent 9.05% → 9.31% (+0.26pp). Update baseline via: bun run jscpd:baseline`.
   - If the baseline file is absent, fall back to the current "first run: baseline recorded" behavior and log `warn: jscpd baseline missing at .jscpd-baseline.json — recording current values, but failing the gate next run unless committed.`.

3. **`bun run jscpd:baseline` opt-in script**: runs jscpd against `src/`, parses the report, writes the new `.jscpd-baseline.json` with the current values. **This is the only sanctioned way to raise the bar** — never edit the file by hand (the script must overwrite atomically via temp-file + rename to avoid half-written baselines under concurrent runs).

4. **Stop writing `.tmp/jscpd/prev.json`** — delete that path entirely. The committed baseline supersedes it. (Keep `.tmp/run-<id>/jscpd/` per-run reports — those are still useful as per-run evidence.)

5. **Add `.jscpd-baseline.json` to `.gitignore`** exception list: the file IS meant to be committed, so `git check-ignore` must return "not ignored".

## Acceptance Criteria

1. **Baseline file present and committed**: `cat .jscpd-baseline.json` returns valid JSON with `clones`, `dupPercent`, `recordedAt`; `git ls-files .jscpd-baseline.json` returns the path (i.e., tracked).
2. **Gate trips on regression**: temporarily bump the gate's expected `clones` by setting `JSCPD_TEST_BASELINE_CLONES_OVERRIDE` (test hook) so the comparison fails; run `bun run check`; the jscpd step now reports `level: "error"` and the runner exits non-zero. Remove the override; run again; gate passes.
3. **Opt-in script works**: `bun run jscpd:baseline` rewrites `.jscpd-baseline.json` with current run values; second run is a no-op (idempotent on identical input).
4. **Removed `.tmp/jscpd/prev.json` write**: `grep -n 'prev.json' scripts/check-parallel.mjs` returns 0 matches (or only references in comments explaining the removal).
5. **Existing non-blocking `level: "info"` on regression path is now `level: "error"`**: a regression run produces a blocking failure with the diff line above; an improvement (clones or dup-% decreased) still emits a `warn` info line but does not block.

## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §2 P-10 (duplication-debt measurement + silent drift)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §4.3 L-7 (canonical proposition)
- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` §7 row 3 (the 09-18 audit never mentioned jscpd; corrected in revision 2)
- `TASK-dedup-top-jscpd-clone-clusters.md` (filed 2026-09-26 from `jscpd-top.py` output — orthogonal: it identifies the worst offenders; this ticket is the gate that fails when they multiply)

git issue: 28444bc
