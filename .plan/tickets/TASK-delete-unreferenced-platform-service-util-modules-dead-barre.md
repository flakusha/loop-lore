<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete unreferenced platform service/util modules, dead barrels and two unused dependencies

**Status:** Not Started
**Priority:** medium
**Effort:** Small

**Summary:**

Remove the test-only-but-production-unreachable service and util modules, the dead i18n and config/sections barrels, and drop blessed-contrib plus htmx-ext-alpine-morph. Research: .tmp/simplification/platform.md. Re-derive with 'bun run dead:code:src'.

**Context:**

Four modules are exercised by their own tests and by nothing else — the tests pin behaviour no
caller can reach. Two barrels have no production importer. Two runtime dependencies have no importer
whatsoever. Source: `.tmp/simplification/platform.md`. Re-derive with `bun run dead:code:src`.

**Scope — modules to delete (with their test files):**

- `src/services/loot/budget-gate.ts:1-188`
- `src/services/agency/coordination-priority.ts:1-134`
- `src/utils/brands.ts:1-79` (defines 11 branded ID types with zero consumers)
- `src/services/affordance/telemetry.ts:1-75` — note `src/regex/action-parser.ts` keeps
  `ParserStage`/`Verb` for `src/services/affordance/lookup.ts`, but this telemetry module itself has
  only its own test as importer
- `src/utils/get-type.ts:1-36` — no importer at all, not even a test outside its own file

**Scope — dead barrels to delete:**

- `src/i18n/index.ts:1-42` — every i18n consumer imports the concrete module
  (`../../i18n/locale-loader`, `../../i18n/locale-registry`, `../../i18n/types`). The single
  `from "../i18n"` hit at `src/routes/v1/base-surface.ts:16` resolves to `src/routes/i18n.ts`, a
  different file — do not "fix" that import.
- `src/config/sections/index.ts:1-38` — 11 importers, all of them `*.test.ts`
  (`src/routes/nsfw/*.test.ts`, `src/middleware/nsfw-gate/*.test.ts`,
  `src/nsfw/capability-gate.test.ts`); no production import. Repoint those tests before deleting.

**Scope — dependencies to remove:**

- `blessed-contrib` (`package.json:150`, also allow-listed in `knip.json:30` under an inaccurate
  "Runtime/string-resolved … blessed TUI" comment). The only `import blessed from "blessed"` sites
  are `src/tui/app.ts:12`, `src/tui/asset-view.ts:12`, `src/tui/chat/index.ts:16`,
  `src/tui/harness/index.ts:12` — none import `blessed-contrib`.
- `htmx-ext-alpine-morph` (`knip.json:31`). `src/frontend/vendor.ts` and `alpine-init.ts` register
  `htmx-ext-sse` (`vendor.ts:69`, `alpine-init.ts:138`) and import `@alpinejs/morph` directly;
  nothing references the alpine-morph htmx extension.

**Evidence:**

- Literal module-specifier grep across `src tests scripts plugins` yields exactly one importer for
  each of the four service/util modules, all `*.test.ts`.
- `grep -rn "get-type|getType(" src tests scripts` → only `src/utils/get-type.test.ts`
  self-references; no `getType` call site outside its own test body.
- Resolver pass over `src tests scripts plugins` → 0 importers for `src/i18n/index.ts`.
- `grep -rn "blessed-contrib" src tests scripts plugins package.json` → hits only in `package.json`,
  `bun.lock`, `knip.json`, `AGENTS.md:162` and three `docs/` prose files.
- `grep -rn "htmx-ext-alpine-morph" src tests scripts plugins docs package.json` → no matches at
  all outside the lockfile/package.json.

**Caveats / constraints:**

- Deleting a dependency is user-visible in prose too: update `AGENTS.md` and the `docs/` mentions of
  `blessed-contrib` rather than leaving them pointing at a removed package.
- Removing the two barrels means editing test import specifiers; keep the tests asserting the same
  behaviour.
- `src/i18n/plurals.ts` already delegates to `Intl.PluralRules` with a per-locale cache — the audit
  found it lean, so do not "tidy" it while the barrel next to it disappears.
- Each module above has a dedicated test; the tests are the only importer, so deleting the module
  means deleting the test. Do not keep an orphan test.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
