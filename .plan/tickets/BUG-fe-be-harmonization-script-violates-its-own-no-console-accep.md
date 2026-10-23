<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE harmonization script violates its own no-console acceptance criterion

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fe-be-harmonization

**Summary:**

Reconciliation of `.plan/epics/epic-fe-be-harmonization.md` found AC5 unmet: the script is required to emit output only for findings.

`scripts/check-fe-be-harmonization.ts:86-99` emits `console.*` for banners and summaries that are not findings:

- L86 header banner `=== FE-BE harmonization ===`
- L87 summary counts
- L91-93 truncated-advisory banner
- L96 fail banner
- L99 OK banner

L88/L89 (blocking and advisory findings) are the only permitted uses. Route the banners through the project logger, or fold them into a single summary line adjacent to the findings they describe, per AC5.

Note: `console.*` is an enforced anti-pattern in `.agents/references/banned-patterns.md`, so this is a policy violation as well as an epic-AC violation.

**Context:**

// hint: Structural and logic conflict. Both design and behavior differ.
Resolution: the banner/counts/success lines were folded into a single summary line printed adjacent to the findings they describe, which is the second option this ticket allows. `scripts/check-fe-be-harmonization.ts` now writes stdout only when there are blocking findings: one summary line (blocking count, advisory count, FE calls / BE routes / schemas), the blocking findings, an advisory preview capped by `ADVISORY_PREVIEW`, and one truncation pointer at the full `.tmp/fe-be-harmony.json` report. A clean run prints nothing and exits 0 — the check report's own pass row carries the verdict, so the deleted `OK: no blocking drift.` line had no reader. `console.*` here is a CLI report on stdout, not server-side logging: every sibling check script (`check-wiring.ts`, `check/i18n-keys.mjs`, `check/test-gaps.mjs`) writes the same way, so routing through `getLogger()` would send gate findings to a log file instead of the console excerpt the runner prints.

**Acceptance Criteria:**

- [x] Implementation complete — findings only on stdout, one summary line, silent on success.
- [x] Tests passing — gate exits 0 silently on dev; failure path verified by injecting drift.
- [x] Documentation updated — script header output contract + epic AC5.

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue a5f1d91 (registry tip: 6ebb0e90f Konstantin Fedotov Close issue)
## Verification

- `bun run scripts/check-fe-be-harmonization.ts`: no output, exit 0.
- Probe: temporary `feFetch("/api/__harmony_probe_missing_route")` in `src/frontend/` → one summary line, one blocking finding at `file:line`, the advisory preview, the truncation pointer at the report path, exit 1; probe deleted (working tree clean afterwards).

**Resolved:** 2026-10-23 registry-driven close: git issue a5f1d91 (registry tip: 6ebb0e90f Konstantin Fedotov Close issue)
