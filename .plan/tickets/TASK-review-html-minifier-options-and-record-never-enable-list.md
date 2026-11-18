<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Review HTML minifier options and record never-enable list

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-frontend-bundle-optimization.md
**Tags:** frontend, build, html, minify, configuration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Review the shared HTML minifier option set, keep the spacing-safe choices, and record a permanent NEVER-enable list for options that corrupt Alpine bindings or delete live htmx targets.

**Evidence (file:line)**

- Shipped set: `src/content/minify.ts:8-20`; measured over 193 files (`.tmp/research/html-stripping-patterns.md` §2): 184 OK / 9 parse errors, 990,767 -> 718,355 B, testids 1255 -> 1255.
- Validated candidate set (`html-stripping-patterns.md` §2, `probe-candidate-out.txt`): shipped set + `conservativeCollapse: true` + `collapseInlineTagWhitespace: false` + `ignoreCustomFragments` including `/\{\{\{[^}]*\}\}\}/` + `ignoreCustomComments` including `/Initialize locale from cookie/` -> 193 OK / 0 failures, 990,767 -> 710,558 B, testids unchanged, locale-injection anchor preserved.
- Spacing drift: `collapseInlineTagWhitespace` turns `<span>a</span> <span>b</span>` into `<span>a</span><span>b</span>`; `conservativeCollapse` keeps the space. The entire extra-option gain is <=1 KB gzip (`.tmp/research/html-prod-stripping.md` §2/§4(a): `removeAttributeQuotes` -22,532 B raw but only -997 B gzip; others <=6.5 KB raw or 0).
- `ignoreCustomFragments`/`ignoreCustomComments` are validated but UNNEEDED now: the 9 templates that needed them were fixed at the source by `8c8cd7a8f` (outer attribute quotes switched to single), and all 194/194 now parse (`.tmp/html-strip-fix-ledger.md` §2).
- NEVER `removeAttributeQuotes`: corrupts Alpine bindings — `x-data="app()" :href="'/w/' + id" @click="go()"` becomes `x-data=app() ... @click=go()` (`html-stripping-patterns.md` §2).
- NEVER `removeEmptyElements`: -133,770 B raw but a measured sample deleted the live empty htmx OOB targets `id="header-slot"` (`src/views/layout.html:370-371`) and `id="toast-container"` (`src/views/layout.html:78`) (`html-prod-stripping.md` §2).

**Why deferred (low priority)**
<=1 KB gzip benefit for a global option change, and all templates already parse, so there is no live defect. Kept out of the two landed fixes deliberately.

**Acceptance criteria**

- [ ] Explicit decision recorded on `conservativeCollapse` / `collapseInlineTagWhitespace` with a before/after spacing check on inline-tag sequences.
- [ ] `ignoreCustomFragments` / `ignoreCustomComments` either left unset with the reason recorded (194/194 parse) or added with a test proving the locale anchor at `src/views/layout.html:72` survives.
- [ ] A test (or comment next to `src/content/minify.ts:8-20`) permanently forbids `removeAttributeQuotes` and `removeEmptyElements` with the two concrete failure modes above.
- [ ] No attribute drift for `data-testid`, `x-*`, `@*`, `:*`, `hx-*`.

**Verification command for the implementer**
`bun test src/content/minify.test.ts`, `bun run scripts/check-frontend-templates.ts`, `bun run lint:html`, and `bun run test:e2e:browser` (Alpine/htmx smoke). Baseline: 194/194 parse, testid count unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
