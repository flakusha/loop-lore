<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Evaluate Biome as Complementary Linter/Formatter

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 💡 Deferred
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

- [x] Evaluate Biome formatter compatibility with dprint config
- [x] Identify ESLint rules Biome can replace
- [x] Benchmark format + lint time savings
- [x] Decision: adopt, complement, or skip

## Source

Git issue: `48f6d6e`
Origin: `docs/meta/open-items.md` (TOOL.1)

## Resolution

Published the evaluation at `docs/research/biome-evaluation.md`. **Recommendation: skip** (status stays 💡 Deferred).

Key findings:

- The current stack is `dprint` (format) + `oxlint` (lint, fast) + `ESLint` (lint, narrow) + `Biome` (already scoped to `docs/**/*.md`). Per `eslint.config.mjs` lines 8-12, ESLint is kept ONLY for `import/*`, custom AST selectors (JSON.parse/stringify, Promise.all), and `jsdoc/*`. Biome cannot replace any of those.
- Biome formatter has narrower coverage than dprint: no HTML, no YAML, no TOML, no shell. Dropping dprint for Biome would regress on those file types.
- Type-aware rules (`@typescript-eslint/no-floating-promises`, etc.) cannot move to Biome; Biome does not bind to the TS compiler API.
- The "25x faster" pitch lands only against ESLint's slowest mode. Our baseline is oxlint (already very fast). Marginal speed gain is small.
- The current `biome.json` scope (`docs/**/*.md`) is the right niche for Biome. Leaving it as-is.

What would flip the decision: Biome 2.0 type-aware lint, or dropping dprint for HTML/YAML/shell (unlikely).

Status remains 💡 Deferred — the research is complete, the answer is "not now".
