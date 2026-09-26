<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# jscpd ratchet: persist baseline, gate on rising clones/dup-%

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task

**Summary:** The jscpd step (`scripts/check-parallel.mjs:1167-1231`) compares the current run against `.tmp/jscpd/prev.json` and overwrites it every run, so the comparison spans **one run only**. Observed drift in `.tmp/check-report.json` (line ~262): 3003 clones on 2026-09-25 (first run, baseline recorded) → 3005 clones on 2026-09-26 (reported as `level: "info"` non-blocking, message "unchanged vs last run"). The 09-18 gate audit (`grep -c -i 'jscpd\|clone' .tmp/heavy-gate-audit-2026-09-18.md` = 0) never mentions jscpd at all — silent debt. This ticket adds a **committed, long-lived** `.jscpd-baseline.json` at the repo root, gates the check on rising clones OR dup-%, and exposes `bun run jscpd:baseline` as the intentional opt-in to raise the bar.

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
**Context:** Filed via giwt template lacking required bold sections; normalized 2026-09-26 during the mock-isolation migration finalize.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification executed green
