<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix lint baseline debt (11 no-restricted-syntax errors)

**Status:** ✅ Done (2026-09-05, fix-lint-baseline-debt worktree)
**Priority:** low
**Effort:** Small

## Summary

`bun run check` on dev reports 21/22 — the only red gate is `lint - eslint` with exactly **11 errors**, all `no-restricted-syntax` and all mechanical swaps to existing utils. These are pre-existing dev-baseline errors (byte-identical to dev before the char-growth workstream), outside the char-growth scope, surfaced as the residual after the character-growth gate fixes merged.

The 448 warnings (`no-explicit-any` ×245, `jsdoc/require-jsdoc` ×190, `no-console` ×13) are advisory and NOT part of this ticket — the gate hard-blocks on errors only.

## Inventory (11 errors, 5 files)

| File | Lines | Pattern |
|---|---|---|
| `src/characters/services/relationships-service-bridge.ts` | 95-96 | 2× `JSON.stringify` → `jsonStringifyOr` |
| `src/characters/services/skills-service-bridge.ts` | 71 | 1× `JSON.stringify` → `jsonStringifyOr` |
| `src/characters/services/traits-service-bridge.ts` | 69-70 | 2× `JSON.stringify` → `jsonStringifyOr` |
| `src/frontend/character-growth-editor.js` | 41, 60 | 2× `JSON.stringify` → `jsonStringifyOr` |
| `src/frontend/character-growth-editor.js` | 38, 55, 76, 92 | 4× bare `fetch` → `safeFetch` |

## Approach

- **Bridges (5 sites):** `jsonStringifyOr()` returns `string` (never throws, `"{}"` fallback) — exact drop-in for `beforeJson`/`afterJson` `string | null` fields on `InsertGrowthLogInput`. Same pattern already merged in `crud-arc.ts` (7d90febb).
- **Frontend editor (6 sites):** `jsonStringifyOr()` same. `safeFetch()` never throws — returns `{ok, error, status}` union; wraps network errors, HTTP non-2xx, timeouts, size limits. Current code relies on `fetch` throwing into the catch block, so the swap adds `if (!result.ok) { throw new Error(result.error?.message ?? "Request failed"); }` inside each try — preserves the exact catch-path error-message semantics. `safeFetch` is exported from `src/utils.ts` and already imported by other frontend files (`asset-preview.ts`, `alpine/transports/*`).
- No behavior change: same endpoints, same methods, same bodies, same error UX.

## Acceptance Criteria

- [ ] `bunx eslint src/` → 0 errors (warnings remain, advisory)
- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run check` → 22/22
- [ ] Finalized via `scripts/worktree/ finalize` without `--force`

## Resolution (2026-09-05)

All 11 `no-restricted-syntax` errors resolved; `bun run check` is **22/22** (was 21/22).

**(a) Bridge files — 5 sites, `jsonStringifyOr()`**
- `relationships-service-bridge.ts:95-96` — `beforeJson`/`afterJson` → `jsonStringifyOr()`
- `skills-service-bridge.ts:71` — `afterJson` → `jsonStringifyOr()`
- `traits-service-bridge.ts:69-70` — `beforeJson`/`afterJson` → `jsonStringifyOr()`
- `jsonStringifyOr` (never throws, `"{}"` fallback) is the exact drop-in for the `string | null` fields; same pattern as `crud-arc.ts` in 7d90febb.

**(b) Frontend editor — 6 sites**
- `character-growth-editor.js` converted from a zero-import IIFE to an ES module importing `jsonStringifyOr` + `safeFetch` from `../utils`.
- 2× `JSON.stringify` → `jsonStringifyOr`; 4× bare `fetch` → `safeFetch` with `if (!result.ok) throw new Error(result.error.message)` preserving the existing catch-path error-message semantics (safeFetch never throws — returns `{ok, error}` union).
- **Finding:** the file was orphaned — referenced by no bundle (`pages.ts`/`alpine-init.ts`/`build-frontend.mjs`), no script tag, no import. `TASK-char-growth-frontend` (Not Started) will wire it. The ESM conversion is forward-compatible with that wiring.

**Verification**
- `bunx eslint src/` → 0 errors (448 warnings remain, advisory: `no-explicit-any` ×245, `jsdoc/require-jsdoc` ×190, `no-console` ×13)
- `bunx tsc --noEmit` clean; `bunx dprint check` clean
- `bun test src/characters/ src/utils/` → 376 pass, 0 fail
- `bun run check` → **22/22** (plan:ticket-index synced via `plan:sync:fix` after ticket filing)
- Finalized via `scripts/worktree/ finalize` without `--force`
