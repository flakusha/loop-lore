<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FIX: Parallelize bun test invocations - isolate pins suite to one core

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

bun 1.4 semantics: --isolate = fresh global per file inside ONE process (no parallelism); --parallel=N = N workers and implies --isolate. Introduced c611d43e6 (2026-07-20, cross-file pollution workaround) + 31978260a + c7557e65f; observed: scoped gates 20-60+ min, giwt finalize SIGTERM exit 143. In-flight tree/fix-check-coverage-jobs fixes only the check gate; this ticket lands the remaining layers: package.json test/test:unit/test:coverage -> --parallel=4 --isolate; delete no-op test:unit:parallel (--concurrency is not a file-parallel flag - probed no-op) + OOM-prone test:parallel; ci script + cicd-pipeline.md reference updates; ci.yml unit job -> --parallel=4. Script names unchanged so npm_lifecycle_event isolation gates keep working.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
