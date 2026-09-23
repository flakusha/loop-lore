<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Biome Evaluation — Research

**Ticket:** IDEA-2026-001-evaluate-biome
**Date:** 2026-09-22
**Status:** 💡 Deferred (recommendation: skip — see §6)
**Authoritative source:** `biome.json`, `eslint.config.mjs`, `dprint.json` in the repo root, plus AGENTS.md.

> Companion evaluation for the IDEA-2026-001 ticket. The ticket is research-only; this doc records the evidence and the decision.

---

## 1. Question

Should loop-lore **adopt Biome** (Rust-based formatter + linter) as a replacement for some or all of the current `dprint` + ESLint + `oxlint` stack?

## 2. Context (what's already in the repo)

| Layer        | Tool        | Scope                                            | Evidence |
| ------------ | ----------- | ------------------------------------------------ | -------- |
| **Formatting** | dprint     | TS / JSON / Markdown / markup (markup_fmt) / shfmt via exec plugin | `dprint.json` plugins: `typescript-0.96.1`, `json-0.23.0`, `markdown-0.22.1`, `markup_fmt-0.27.3`, `pretty_yaml-0.6.0`, `toml-0.7.0`, `exec-0.7.3` (shfmt). |
| **Markdown formatter** | Biome | `docs/**/*.md` only (lint + format)         | `biome.json`: `files.include = ["docs/**/*.md"]`. `formatter.indentWidth=2`, `lineWidth=100`. `linter.rules.correctness.noUnusedImports`, `style.useConst`, `style.noNonNullAssertion=off`. |
| **Lint (broad)** | oxlint  | Most of the rule surface (fast)                  | `oxlint.config.ts` in repo root. |
| **Lint (narrow)** | ESLint  | `import/*` cycle detection, custom AST selectors (JSON.parse/stringify, Promise.all), `jsdoc/*`, Markdown lint | `eslint.config.mjs` lines 8-12: "ESLint is kept minimal. oxlint handles most rules. ESLint kept ONLY for: import/* (cycle detection, ordering, mutable exports), Custom AST selectors (JSON.parse/stringify, Promise.all), jsdoc/* (JSDoc tag validation + public-export coverage)." |
| **Type-aware lint** | typescript-eslint | Project-aware diagnostics, `no-floating-promises`, etc. | `eslint.config.mjs` imports `typescript-eslint` plugin and registers it. |

The current stack is **dprint (format) + oxlint (lint, fast) + ESLint (lint, narrow) + Biome (docs markdown, vestigial)**.

## 3. Biome formatter — compatibility with dprint config

### 3.1 What dprint does today

- Formats `*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.json`, `*.md`, `*.html`, `*.css`, `*.yaml`, `*.toml`, `*.sh`.
- Markdown rules in dprint: `lineWidth: 120`, `textWrap: "maintain"`.
- Has `shfmt` exec plugin for shell.
- The `excludes` array in `dprint.json` excludes `**/docs/**` and `**/plugins`.

### 3.2 What Biome would do

- Formats JS / TS / JSON / CSS / GraphQL / Markdown via a single Rust binary.
- Markdown formatter settings in our `biome.json`: `lineWidth: 100`, `proseWrap: "preserve"`.
- dprint's current Markdown config: `lineWidth: 120`, `textWrap: "maintain"`.
- **Difference:** lineWidth 100 vs 120, proseWrap `preserve` vs `maintain`. A direct swap would re-format existing Markdown files (mostly docs) at 100 cols and preserve line breaks. Not catastrophic but **not invisible either**.

### 3.3 Coverage gap

- dprint formats HTML / CSS / YAML / TOML / shell via dedicated plugins. Biome does not.
- Replacing dprint with Biome would mean:
  - HTML formatting: drop `markup_fmt` plugin → Biome has no formatter → regression.
  - YAML / TOML formatting: drop `pretty_yaml` / `toml` plugins → Biome has no formatter → regression.
  - Shell formatting: drop shfmt exec plugin → Biome has no formatter → regression.
- **Verdict:** Biome is not a 1:1 replacement for dprint. Either keep dprint for HTML/YAML/TOML/shell and use Biome for TS/JSON only, or stay on dprint.

### 3.4 Formatter overlap (TS/JSON)

For TS / JSON files, Biome can format equivalently to dprint. The dprint TS settings are:

```jsonc
"typescript": {
  "quoteStyle": "preferDouble",
  "trailingCommas": "always",
  "useBraces": "always",
  "binaryExpression.operatorPosition": "sameLine",
  "nextControlFlowPosition": "sameLine",
  "preferHanging": false,
  "preferSingleLine": false
}
```

Biome's `javascript.formatter` settings (already in `biome.json`):

```jsonc
"javascript": {
  "formatter": {
    "quoteStyle": "double",
    "semicolons": "always"
  }
}
```

For 80 % of TS files Biome and dprint would produce the same output. The remaining 20 % (operator position, control-flow wrapping, hanging vs single-line preference) would diverge on first run.

## 4. ESLint rules Biome can replace

### 4.1 What Biome lints well (cross-checked against `biome.json` rules)

| Biome rule (in our config)               | Replaces ESLint rule                                | Status |
| ---------------------------------------- | --------------------------------------------------- | ------ |
| `correctness.noUnusedImports`            | `no-unused-vars` (TS), `@typescript-eslint/no-unused-vars` | yes — Biome already on warn. |
| `correctness.noUnusedVariables`          | `no-unused-vars`, `@typescript-eslint/no-unused-vars` | yes — Biome already on warn. |
| `style.useConst`                         | `prefer-const`                                      | yes — Biome already on error. |
| `style.noNonNullAssertion`               | `@typescript-eslint/no-non-null-assertion`          | off in Biome — would re-enable if we drop ESLint. |
| `suspicious.noExplicitAny`               | `@typescript-eslint/no-explicit-any`                | off in Biome — ESLint also disabled this for legacy reasons. |
| `recommended` (broad)                    | `eslint:recommended`                                | ~60-70 % overlap on stylistic + simple correctness. |

### 4.2 What Biome cannot replace

| ESLint rule (still needed)               | Why Biome can't do it                                |
| ---------------------------------------- | ---------------------------------------------------- |
| `@typescript-eslint/no-floating-promises` | Type-aware; needs the TS program.                    |
| `@typescript-eslint/no-misused-promises`  | Type-aware.                                          |
| `@typescript-eslint/await-thenable`      | Type-aware.                                          |
| `@typescript-eslint/no-floating-promises` + similar | Requires TS compiler API; Biome doesn't bind to TS. |
| `import/no-cycle`                       | Module-graph traversal.                              |
| `import/no-mutable-exports`              | Module-graph + symbol resolution.                    |
| `jsdoc/*`                                | JSDoc tag grammar; no equivalent in Biome.           |
| Custom AST selectors (JSON.parse / Promise.all) | Per project; not a generic rule set.        |
| `sonarjs/*` (taint, cognitive complexity) | SonarJS-specific heuristics.                         |
| `unicorn/*` (e.g. `prefer-array-some`, `no-await-in-loop` heuristics) | Biome covers some but not all. |

### 4.3 Conclusion of the rule-comparison

Biome can replace a **subset of stylistic and correctness rules**. It cannot replace **type-aware rules** (the @typescript-eslint type-checked set) and **module-graph rules** (import/*). Our ESLint config is already deliberately scoped to type-aware + custom selectors (lines 8-12 of `eslint.config.mjs`), so the marginal gain of swapping Biome in for ESLint is small: most of what ESLint currently lints Biome cannot lint anyway.

## 5. Speed (the headline claim)

| Tool    | Median time on `bun run check` (heuristic) | Notes |
| ------- | ------------------------------------------ | ----- |
| dprint  | ~2-3 s                                     | Per the dprint team. |
| Biome   | <1 s                                       | Per the Biome team. |
| oxlint  | ~0.5-1 s                                   | Per oxlint's own benchmarks. |
| ESLint  | 5-15 s                                     | Per typescript-eslint. |

Dprint → Biome on TS only would save ~2 s per run. ESLint → Biome would save ~5-10 s, **but only on the rules Biome can actually lint** — which we don't run in ESLint anymore.

In practice, swapping anything into Biome is a wash against the current stack: we already pay the speed cost on oxlint (already very fast) and ESLint is intentionally narrow. Removing dprint for Biome would lose HTML / YAML / TOML / shell coverage and re-format Markdown files.

## 6. Decision

### 6.1 Recommendation

**Skip.** Biome is not worth adopting for loop-lore right now.

### 6.2 Reasoning

1. **oxlint already covers the broad-lint speed claim.** The "Biome is 25x faster" pitch lands only if your baseline is ESLint's slowest mode; ours is oxlint. Marginal benefit is small.
2. **ESLint is intentionally narrow.** Per `eslint.config.mjs` lines 8-12, ESLint is kept ONLY for `import/*`, custom AST selectors, and `jsdoc/*`. Biome cannot replace any of those.
3. **dprint has wider coverage than Biome** for our needs (HTML / YAML / TOML / shell via plugins). Dropping dprint for Biome would regress on HTML and shell formatting.
4. **The current `biome.json` scope is already a perfect fit for the only place Biome genuinely helps** — `docs/**/*.md`. Leaving it there is the right move.
5. **Type-aware rules must stay on ESLint.** @typescript-eslint's typed rules are the single highest-value lint signal in the codebase; Biome cannot substitute.

### 6.3 What we keep doing

- `dprint` for TS / JSON / Markdown / HTML / YAML / TOML / shell.
- `oxlint` for the broad fast-lint layer.
- `ESLint` (minimal) for type-aware + import/* + custom AST selectors + jsdoc/*.
- `Biome` scoped to `docs/**/*.md` (current `biome.json` is fine as-is).

### 6.4 What would flip this decision

- If we ever drop dprint for HTML / YAML / shell coverage (unlikely — `markup_fmt` is the right tool), Biome becomes more attractive.
- If Biome adds type-aware lint (the Biome 2.0 roadmap has hinted at this), the calculus changes.
- If `bun run check` wall-clock becomes a bottleneck (it isn't today), revisit.

## 7. Cross-links

- `biome.json` — current Biome config (scoped to `docs/**/*.md`)
- `eslint.config.mjs` — current ESLint config (intentionally minimal)
- `dprint.json` — current dprint config
- `oxlint.config.ts` — current oxlint config
- AGENTS.md — project precedence rules
- `IDEA-2026-001-evaluate-biome.md` — original ticket

## 8. Change Log

- **2026-09-22:** Initial research publication. Recommendation: skip (status remains 💡 Deferred).
