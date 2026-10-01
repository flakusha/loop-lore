<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: jscpd ratchet gate silently removed without ticket

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-code-quality.md
**Tags:** code-quality

**Summary:** jscpd ratchet gate silently removed without ticket
**Context:** Context: 82e2b0536 landed blocking jscpd ratchet (scripts/check/jscpd-ratchet.mjs + jscpd-baseline.json + package script); 81343b060 (09-26) deleted all three with no ticket, downgrading duplication checking to advisory trend note (check-parallel.mjs:1241-1303).
**Acceptance Criteria:** either re-land the ratchet as-is from 3961cbbe0 or close this ticket as the recorded removal decision.

## Summary

Context: 82e2b0536 landed blocking jscpd ratchet (scripts/check/jscpd-ratchet.mjs + jscpd-baseline.json + package script); 81343b060 (09-26) deleted all three with no ticket, downgrading duplication checking to advisory trend note (check-parallel.mjs:1241-1303). Severity: process. Ratchet LEVEL stays deferred per review contract — but the removal itself must be a recorded decision. Fix: either re-land the ratchet as-is from 3961cbbe0 or close this ticket as the recorded removal decision.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Applied the acceptance criteria's **option A** — re-landed the ratchet rather than closing this as an accepted removal. The 09-26 deletion was a carry-over fold of dev's evolving state, not a recorded decision.

- `scripts/check/jscpd-ratchet.mjs` and `scripts/check/jscpd-baseline.json` restored from the authored version (`3961cbbe0` / `82e2b0536`) and registered as a **blocking** check in `scripts/check-parallel.mjs`; the advisory trend-note block is removed, not duplicated.
- Baseline re-measured against the current tree instead of trusting the 2026-09-26 number: `3052` clones (the old `3051` would have failed immediately on restore). Re-verified after the merge landed: `3052` = `3052`.
- The ratchet LEVEL stays deferred per the review contract; only the gate mechanism is restored.

Evidence across the failure paths, not just the happy path:

| Path | Command | Result |
|---|---|---|
| at baseline | `bun run check --gates "jscpd ratchet"` | PASS |
| growth | `--baseline <3000>` | exit 1, `FAIL ... 3052 clones exceeds baseline 3000` |
| lowering | `--update --baseline <4000>` | exit 0, `lowered: 4000 -> 3052` |
| refuse to raise | second `--update` at 3052/3052 | exit 1, `refusing to update baseline` |
| corrupt/missing report | `--report <absent>` | exit 1 (`ENOENT`); bare invocation exit 2 (usage) — fail-closed, never a silent pass |
