<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: JSDoc coverage cleanup — public exports

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large (ongoing)
**Epic:** epic-code-quality-and-standards.md

## Summary

ESLint now enforces JSDoc on all public exports at `warn` level (recommendation-level, non-blocking). ~12,400 warnings across `src/`. This ticket tracks the ongoing cleanup to bring coverage to 100%, then promote rules from `warn` to `error`.

## Current state

- `eslint-plugin-jsdoc` added with `flat/recommended-typescript` preset
- `jsdoc/require-jsdoc` targets public exports only (functions, classes, interfaces, type aliases, arrow functions)
- All rules at `warn` level — `check` stays green while surfacing debt
- 0 errors, ~12,400 warnings (10,400 auto-fixable with `--fix`)

## Direction

1. **Phase 1 — Auto-fix**: Run `eslint --fix` to auto-correct tag formatting, alignment, empty tags
2. **Phase 2 — Missing tags**: Add `@param`, `@returns`, `@throws` to functions that have JSDoc but incomplete tags
3. **Phase 3 — Missing JSDoc**: Add JSDoc blocks to all public exports (functions, classes, interfaces, type aliases)
4. **Phase 4 — Promote**: Once coverage is clean, change all `jsdoc/*` rules from `warn` to `error`

## Scope

- `src/**/*.ts` (server + frontend)
- Public exports only (not private/internal helpers)
- Excludes: `**/.tmp/`, test files, scripts

## Acceptance criteria

- [ ] `eslint --fix` applied (auto-fixable warnings cleared)
- [ ] All public function exports have `@param` + `@returns`
- [ ] All public class exports have JSDoc
- [ ] All public interface/type exports have JSDoc
- [ ] `jsdoc/*` rules promoted from `warn` to `error`
- [ ] `bun run check` green with 0 jsdoc warnings

## Related

- `eslint.config.mjs` — JSDoc config block (lines ~140-170)
- AGENTS.md — "JSDoc: All public exports — @param, @returns, @throws, @example"

