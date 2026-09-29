<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Self-Error-Check Loop — Targeted Repro Before Full Check

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task / Infrastructure
**Tags:** agent, check, repro, mrp, self-heal
**Epic:** epic-recursive-self-improvement

Self-error-check loop: agent writes a targeted repro of the reported failure first, fixes, re-runs repro, then runs the full gate — repro outcome recorded in the MRP (#16) so merges prove the bug died, not just that the suite stayed green.

## Core Features

- `src/agent/api/self-check.ts` — loop contract: `repro (fails before) -> patch -> repro (passes) -> full check (#7) -> MRP entry`; aborts to human when repro still fails after N attempts (config, default 3).
- MRP schema extension (#16): `repro_before`, `repro_after`, `attempts` fields; MRP without repro section rejected at finalize (#8).
- Wired into agent check endpoint (#7) as opt-out (default on); standalone `bun run self-check <ticket>` for local use.

## Acceptance Criteria

- [ ] Ticket with repro shows failing-before/passing-after evidence linked in MRP
- [ ] Patch that passes full suite but fails its own repro is rejected at finalize
- [ ] 3 failed repro attempts escalate to human with attempts log attached
- [ ] Integration test: seed bug -> loop finds, fixes, proves via repro

## Files

- `src/agent/api/self-check.ts` — new
- `src/agent/api/self-check.test.ts` — new
- `src/agent/api/check.ts` — invoke loop (extends #7)
- MRP schema (extends #16) — `repro_before/after`, `attempts`

## Notes / Verification

- Depends on #7 (check streaming), #8 (finalize gate), #16 (MRP schema).
- Repro-first discipline; skipped auto-bisection, add when manual repro measurably stalls.


git issue: 2d2c5ea
