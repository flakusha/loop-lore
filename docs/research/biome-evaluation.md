<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Biome Evaluation — Complementary Linter/Formatter for loop-lore

**Ticket:** IDEA-2026-001-evaluate-biome
**Date:** 2026-09-23 · **Status:** Deferred — not blocking

## 1. Question

Can Biome (Rust-based linter/formatter) complement or replace parts of the existing tooling (Prettier, ESLint) without breaking the current style contract?

## 2. Current Tooling

| Tool | Role | Config location |
| ---- | ---- | -------------- |
| ESLint + `@typescript-eslint` | Type-aware linting | `.eslintrc.json` |
| Prettier | Code formatting | `.prettierrc` |
| dprint | Additional formatter | `dprint.json` |
| Biome | Linter + formatter | `biome.json` |
| stylelint | CSS linting | `.stylelintrc.json` |

Biome is already installed (`@biomejs/biome` in `package.json`, version 2.5.4 per `TASK-dev-tooling-updates.md`). `biome.json` currently targets `docs/**/*.md` only — it never scans `src/`.

## 3. Biome Capabilities vs. Current Tools

### What Biome covers well

| Category | ESLint rule examples | Biome coverage |
| -------- | -------------------- | -------------- |
| Formatting | `indent`, `quotes`, `semi` | Biome owns formatting |
| Simple style | `no-unused-vars`, `no-console`, `no-debugger` | Biome owns these |
| Import order | `import/order` | Biome `organizeImports` |
| Simple logic | `no-empty`, `no-sparse-arrays` | Biome owns these |
| Type-aware | `no-floating-promises`, `no-unnecessary-type-assertion` | ESLint + ts-eslint only |
| React hooks | `rules-of-hooks` | ESLint only |
| Jest assertions | `jest/valid-expect` | ESLint only |
| Bun-specific | `bun/internationalize-json-imports` | ESLint plugin only |

**Overlap estimate: 60–70% of non-type-aware ESLint rules** could move to Biome, removing the Prettier step from `bun run check`.

### What must stay on ESLint

- Type-aware rules (`@typescript-eslint`)
- Bun-specific rules (`bun/internationalize-json-imports`)
- React rules (`react-hooks/exhaustive-deps`)
- Jest/test rules (`jest/valid-expect`)
- Any custom rules in `.eslintrc.json`

## 4. Compatibility with dprint

dprint handles TypeScript and Markdown. Biome also handles both. Both can coexist — assign Biome as the primary formatter for `src/` and leave dprint for its current scope.

## 5. Benchmark Potential

Biome benchmarks show ~25x formatting speedup over Prettier. `bun run format` (Biome) would replace the Prettier and dprint formatting steps for `src/`. Estimated `bun run check` time reduction: removing Prettier step saves ~2–5 s on typical runs.

## 6. Decision Options

| Option | Action | Risk |
| ------ | ------ | ---- |
| Adopt | Extend `biome.json` `include` to `src/**/*.{ts,tsx,js,jsx}`; disable conflicting ESLint rules; add to `check` pipeline | Medium: audit rule conflicts |
| Complement | Biome for `src/` formatting only; keep ESLint for all linting | Low: no rules overlap to resolve |
| Skip | Close ticket; Biome remains at `docs/` scope only | N/A |

**Recommendation: Complement** — Extend Biome to `src/` for formatting only. Disable conflicting ESLint rules incrementally. Do not remove ESLint entirely (type-aware rules require it).

## 7. Implementation Path (if Adopt/Complement)

1. Audit ESLint rules that Biome duplicates → list rules to disable in `.eslintrc.json`
2. Update `biome.json` `include` to `["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx"]`
3. Add `biome` step to `check` pipeline (or replace Prettier step)
4. Run `biome format --write src/` and commit formatting changes
5. Update `TASK-dev-tooling-updates.md` with results

## 8. Related Tickets

- `TASK-dev-tooling-updates.md` — update Biome to 2.5.4
- `TASK-codemod-fetch-json-safe-utils.md` — notes Biome is installed but unused for `src/`
- `epic-code-quality.md` — parent epic
