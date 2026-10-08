<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: giwt: batch command for run/finalize/check

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Belongs to the **giwt** tool, not loop-lore. Tracked here as planning only; implement upstream.

**Problem.** Running a giwt command across N worktrees today means shelling out per worktree and parsing `report --json` by hand. This is the one genuine orchestration gap in the tool: every other candidate in the research shortlist reuses an existing seam, this one does not.

**Evidence.** Design and evidence: `docs/research/04-giwt-extension-candidates.md` §E2 (`:280-300`), ranked `#3` in the Value/Effort table at `:370` — **High value, Medium effort**, "the one genuine orchestration gap. Reuses `getWorktrees` and the doctor memory clamp; adds no new persistence." Rationale at `:227`/`:236`.

**Design (from research §E2).**
- Lives at `src/commands/batch.ts`; split at 250 lines if needed (precedent: `abort/helpers.ts:5-8`).
- Surface: `giwt batch <run|finalize|check> [args...] [--branches <csv>] [--jobs <n>] [--dry-run] [--json|--toml|--emoji]`.
- **Reads:** the same worktree list `list`/`report` read — `getWorktrees(repoRoot)` at `utils/git.ts:225`, the call `report.ts` and `cleanup.ts:19` already use.
- **Writes:** nothing new — run records and ledger lines arrive free via the central wrapper (`src/cli.ts:155-165`).
- **Concurrency MUST reuse the doctor memory clamp**, not reinvent it: call `effectiveJobs` (`src/doctor/check/entry.ts:75`) rather than recomputing it. `DOCTOR_PER_WORKER_MEM_MB = 1024` (`src/doctor/check/entry.ts:68`), overridable via `[doctor] memory_budget_mb` (`src/utils/settings.ts:34`). Copying that arithmetic is both a jscpd hit and a drift risk. There is a second consumer already — the finalize gate pool mirrors the same sizing (`src/commands/finalize/gates.ts:55`).
- **Root-only guard:** NOT in `ROOT_ONLY_COMMANDS` (`src/cli.ts:70-76`) — like `finalize`, it resolves targets from arguments and is cwd-independent (documented exemption, `src/cli.ts:64-68`).

**Verification** (research `:296-300`): (1) N worktrees × 1 fake action → N ledger lines, one per branch, each with its own run record dir — seed via the `runs.test.ts:24-28` pattern, assert via `listRuns`; (2) `--jobs 1` output byte-identical to `--jobs 4`; (3) one failing branch does not abort the others, aggregate exit 1 names each failure; (4) zero matching branches exits 0 with an empty JSON array, not 1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
