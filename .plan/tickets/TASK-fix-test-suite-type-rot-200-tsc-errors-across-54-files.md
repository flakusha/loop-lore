<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix test-suite type-rot: 200 tsc errors across 54 files

**Status:** ⬜ Not Started
**Epic:** epic-code-quality
**Priority:** Medium
**Effort:** Medium

## Summary

bun run typecheck is red: 200 errors in 54 files, nearly all *.test.ts. Top kinds: TS2532 possibly-undefined 69x (65x in image-edit templates.coverage.test.ts alone), TS2322 type-mismatch 66x, TS2740/TS2741 missing-props 20x, TS2339/TS2305/TS2307 stale imports (incl. EnvironmentalModifier, generate-route module). Per-file counts from .tmp/check-report.json triage 2026-09-07. Acceptance: bun run typecheck exits 0. Strategy: per-subsystem passes (image-edit, rpg, routes/messages, memory, story), fix sources where tests expose real drift (cancel-stream, nsfw-user-flag), delete stale tests that pin removed APIs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
