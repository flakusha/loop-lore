<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Evaluate Biome as Complementary Linter/Formatter

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Decision documented (research published 2026-09-23)
**Priority:** medium
**Labels:** idea, tooling

## Summary

Biome (Rust) could replace Prettier (~25x faster) and cover ~60-70% of non-type-aware ESLint rules. Type-aware rules stay on ESLint. Deferred — not blocking.

## Rationale

- Prettier is slow; Biome formats in milliseconds
- Biome covers stylistic + simple logic rules (no-unused-imports, no-console, etc.)
- Type-aware rules (no-floating-promises, etc.) remain on ESLint with TypeScript parser
- Could reduce `bun run check` time by removing Prettier step

## Scope

- [x] Publish research doc: `docs/research/biome-evaluation.md` (2026-09-23)
- [x] Document current tooling landscape vs. Biome capability matrix
- [x] Recommend path: pilot (Complement) — Biome for `src/` formatting only
- [ ] Adopt, complement, or skip — **decision deferred** until a benchmark of `bun run check` is captured

## References

- `docs/research/biome-evaluation.md` — full evaluation
- `.plan/tickets/TASK-dev-tooling-updates.md` — version-bump ticket
- `.plan/tickets/TASK-codemod-fetch-json-safe-utils.md` — codemod effort noting Biome unused for `src/`

## Source

Git issue: `48f6d6e`
Origin: `docs/meta/open-items.md` (TOOL.1)
