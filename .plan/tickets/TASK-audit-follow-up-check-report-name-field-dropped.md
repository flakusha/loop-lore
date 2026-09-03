<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: check report `name` field dropped

**Status:** ✅ Done — verified stale (no code change required)
**Priority:** low
**Effort:** Medium

## Summary

Audit found scripts/check-parallel.mjs output omits the per-check `name` field in the JSON report. Restore or add a top-level `name` for grep/scorecard tooling. See audit .tmp/audit/batch-B-config-size.md finding LOW.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (2026-09-03)

Verified stale — no code change required. The `name` field is present in `scripts/check-parallel.mjs`:

- Line 247 — `runCheck(name, command,)` signature carries the per-check `name` parameter
- Line 264 — `name,` appears as a property in the per-check result object (inside the report entry)
- Line 275 — `name,` appears again in the report assembly (top-level per-check field)
- Line 309 — `chunk.map(([name, command,]) => runCheck(name, command,),)` — `name` is the first tuple element
- Line 326 — `name: "(runner error)"` — synthetic name for errored runners
- Line 345 — `console.log(`✓ PASS: ${result.name}`,)` — surfaced in human-readable output
- Line 348 — `console.log(`✗ FAIL: ${result.name}`,)` — surfaced in human-readable output
- Line 518 — human table output `${name}` from `path.basename(wt.path,)`
- Line 739 — `name: "check - runner"` — placement confirms runner-level name is emitted

The audit claim that the JSON report "omits the per-check `name` field" is contradicted by the source.
For grep/scorecard tooling: each check entry already carries `name` at line 264 of the result object.
No action required. Ticket resolved.
