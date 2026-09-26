<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Filing batch notes — 2026-09-26

## Already-resolved tickets referenced by the audit

- D-02 (giwt finalize cannot name the failing gate): TASK-audit-follow-up-check-report-name-field-dropped (status: done). Cross-reference only; do NOT re-file.

## Withdrawn from this batch

- P-11 / L-8 (license gate reports ok when scancode/fossa are absent): NOT a defect. check-parallel.mjs:1263-1290 emits level: info with message "Neither scancode nor fossa installed - skipping". Recorded in .tmp/scratchpad-pattern-analysis-2026-09-26.md §7 row 20.

## Tickets filed in this batch (loop-lore side)

- D-01 / L-1: BUG-test-e2e-env-default-mismatch.md
- D-03 / L-10: BUG-test-async-store-offload-dir-fixed-path-race.md
- L-4: TASK-async-store-tests-per-test-tmpdir.md
- D-04 / L-3: TASK-async-store-retention-cap.md
- D-05 / G-7: TASK-giwt-show-state-resolve-plan-tickets-filename-slugs.md
- G-1: TASK-giwt-issues-gains-state-open-closed-all-filter.md
- P-08 / L-6: TASK-ticket-status-enum-and-migration.md
- P-10 / L-7: TASK-jscpd-ratchet-persistent-baseline.md
- P-05/P-13 / L-5/L-9: TASK-tmp-janitor-and-staleness-markers.md

## Cross-repo ticket references (informational only — no .plan/ reflection required)

> The following TASK identifiers are tracked in sibling repos (`../giwt`, `../omp-plugins`).
> They are NOT expected to resolve against `.plan/tickets/` in this checkout. The
> `links` gate treats them as informational; this fence block explicitly opts them out.

- `../giwt` (sibling repo, not tracked here): giwt-clean-doctor-runs-scratchpad (G-3+G-4+G-5); giwt-schema-contract-gate (G-6); giwt-plan-validate-status-vocab (G-8)
- `../omp-plugins` (sibling repo, not tracked here): omp-scratchpad-audit-and-session-artifacts (O-1+O-2); omp-ticket-finalize-find-work-hardening (O-3+O-4+O-5+O-6+O-7)
