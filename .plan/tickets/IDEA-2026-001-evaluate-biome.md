# IDEA: Evaluate Biome as Complementary Linter/Formatter

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

- [ ] Evaluate Biome formatter compatibility with dprint config
- [ ] Identify ESLint rules Biome can replace
- [ ] Benchmark format + lint time savings
- [ ] Decision: adopt, complement, or skip

## Source

Git issue: `48f6d6e`
Origin: `docs/meta/open-items.md` (TOOL.1)
