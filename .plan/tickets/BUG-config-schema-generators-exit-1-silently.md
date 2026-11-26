<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: config schema generators exit 1 silently

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-contract-and-config-tooling
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Reported by RSI repo-access lane (evidence verified 2026-11-11/12 on dev + worktree).

bun src/config/generate-schema.ts (re-export of packages/core/src/config/generate-schema.ts, the script behind config:generate-schema / config:generate-toml-schema) exits 1 with no visible error output, on dev and in any worktree. Appears pre-existing.

Static read points at a broken output path: the script builds outputPath as `${__dirname}/@/schemas/loop-lore-config.schema.json` (packages/core/src/config/generate-schema.ts:25) — an '@/' segment lifted from the import-alias comment, not a real directory — so writeFileSync hits ENOENT and process.exit(1) fires at line 32; log.fatal output is evidently not reaching the terminal (logger sink/config issue), hence the silence.

Fix: diagnose and either correct the output path so the generator works, or surface the failure loudly (stderr + non-zero exit with the actual error) — and check the TOML-schema sibling for the same pattern.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
