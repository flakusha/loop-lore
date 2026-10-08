<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Migrate the structurally blocked argv call sites to src/cli/parser

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-cli-tooling-optique

**Summary:**

After the Optique migration, five call sites still parse process.argv by hand. They are not oversights: each is blocked by the shape of its host, so moving them to src/cli/parser.ts needs a restructure, not just a parser swap.

BLOCKED BY MODULE-INIT ARGV (3) -- these read argv at import time and EXPORT the parsed values, which other modules consume on import. runScript returns a value, so it cannot run at module scope without the runner being restructured so that check-parallel.mjs becomes the entry point owning all flag reading, passing results down explicitly:
- `scripts/check/parallel/config.mjs` (MODE from `--ci`/`--fix`, IS_REPORT_LS from `--report-ls`)
- `scripts/check/parallel/context.mjs` (CHANGED_FILES, DIFF_BASE, GATES_FILTER)
- `scripts/check/parallel/runner.mjs` (JOBS from `--jobs` / CHECK_JOBS)

BLOCKED BY DISPATCHER SHAPE (1):

- `scripts/worktree/index.ts` — `const [cmdName, ...cmdArgs] = process.argv.slice(2)`. A flat object parser does not fit a subcommand dispatcher; this needs `command()` grammar or the giwt-style dispatcher.

BLOCKED BY BEING A TEST FIXTURE (1):

- `scripts/worktree/finalize-lock-fixture.ts` — spawned as a child process with positional temp-dir and mode slots by `tests/worktree-flow.test.ts`. Migrating it means changing the harness, for no product benefit. Recommend leaving it and documenting the exemption.

Each remaining site must be verified against its real invocations (package.json, scripts/check/parallel/gates.mjs, .github/workflows) exactly as the migrated ones were, and must preserve its current exit codes -- three of them are blocking gates whose stdout and exit codes the parallel runner consumes.

Context: docs/spec/cli-tooling.md states the MUST-use rule and documents these sites as deliberately exempt pending this work.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
