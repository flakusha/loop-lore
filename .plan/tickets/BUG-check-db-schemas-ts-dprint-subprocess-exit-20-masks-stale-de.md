<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `scripts/check-db-schemas.ts` exit-code masks stale-generation drift as `[TOOLING ERROR]`

**Status:** 🔴 Not Started
**Severity:** Low
**Priority:** Medium
**Type:** BUG
**Epic:** epic-tooling-check-gates
**Files:** `scripts/check-db-schemas.ts:89-99`

## Summary

`scripts/check-db-schemas.ts` shells out to `bunx dprint fmt` on the **generated**
(temp-dir) output at lines 91-94. When the generator emits output whose formatting
diverges from the project's dprint config, dprint returns **exit code 20** ("files
need formatting"). The catch handler at line 95-99 treats every non-zero dprint exit
as a `[TOOLING ERROR]` and calls `process.exit(1)`, **never reaching the actual
`stale` diff loop at lines 102-126**.

The user sees a misleading `dprint fmt on generated output failed` message that
looks like a tooling crash, when the underlying generator worked fine and the
artifact is genuinely stale (or — in the opposite case — a benign
trailing-whitespace drift on an otherwise identical file).

## Root Cause

`scripts/check-db-schemas.ts:91`:

```ts
const _fmt = execFileSync("bunx", ["dprint", "fmt", ...ARTIFACTS.map((a,) => a.generated),], {
  cwd: tmp,
  stdio: ["ignore", "ignore", "pipe",],
},);
```

`execFileSync` throws on **any** non-zero exit. `dprint fmt` returns 20 when files
were reformatted. The catch handler at lines 95-99 cannot distinguish:

- `dprint fmt` reformatted the file (exit 20) — benign
- `dprint fmt` itself errored (exit > 20, stderr) — actual tooling crash
- `bunx` couldn't find `dprint` (exit 127) — actual tooling crash

## Impact

Confuses anyone running `bun run check` or pre-commit:

- False `[TOOLING ERROR]` reports on a clean run after a migration change,
  blocking the commit even though the eventual diff would have flagged the
  staleness correctly.
- Makes it impossible to tell from the log output whether the db-schemas gate
  failed because of a stale artifact or because the formatter couldn't run.

## Acceptance Criteria

- [ ] `scripts/check-db-schemas.ts` correctly distinguishes "dprint reformatted
      (exit 20, benign)" from "dprint itself crashed (exit != 20)". The benign
      case falls through to the diff loop at lines 102-126.
- [ ] When the generator produces stale output, the script exits 1 with the
      same categorized `✗ schema manifest is STALE` message it currently emits
      (verify on a pre-stale-checkout).
- [ ] When the generator produces identical output, the script exits 0 with the
      `All DB schemas up-to-date.` message (verify on a clean checkout).
- [ ] When dprint itself is missing or crashes, the script exits 1 with
      `[TOOLING ERROR]`.
- [ ] Add a smoke test (or `--smoke` mode) that verifies all three exit-code
      categories.

## Verification Notes

Manually verified on `dev @ 793a170d`:
- Clean checkout → script exits 0, reports `All DB schemas up-to-date.` (15
  artifacts).
- No crash observed in this session because the committed artifacts are already
  in sync (last regen at `d79ab177`). Bug only surfaces immediately after a
  migration change that introduces formatting drift in the generated output.

**Discovered by:** cleanup session 2026-08-24, commit `d79ab177` (migration
renumbering). **Reported by:** subagent advisory during fast-low-effort-cleanup
phase.