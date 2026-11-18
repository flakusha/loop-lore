<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Document and enforce runtime HTML response attribute policy

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Document and enforce a runtime HTML response policy: every `text/html` response must keep `data-testid`, htmx, Alpine, mustache/i18n, a11y and nonce hooks. Treat any future stripping request as a contract migration, never a build flag.

**Evidence (file:line)**

- Runtime path: `src/middleware/dynamic-response.ts:89-118` -> `minifyBody` `:130-177`, applied to every response at `src/server/handler.ts:61`, using `src/content/minify.ts:8-20`; parse failures serve the original body unchanged (`dynamic-response.ts:143-156`). Defaults enabled/minify/validate/compress = true (`packages/core/src/config/sections/dynamic-response.ts:8-15`).
- `data-testid` is a PRODUCTION runtime contract, 7 live query sites: `src/frontend/alpine/keynav-goto.ts:73`, `src/frontend/alpine/planning-kanban.ts:29`, `src/frontend/alpine/keynav-help.ts:21`, `src/frontend/chat-actions/scheduling.ts:96`, `src/frontend/chat-utils/interaction.ts:151`, `src/frontend/game-canvas/index.ts:178`, `src/frontend/alpine/chat-style-picker.ts:96` (`.tmp/research/html-stripping-patterns.md` §3). Additionally 50 browser e2e files use testid selectors; `tests/e2e/flows/browser/alpine-hydration-smoke.browser.ts:38-47` uses them as a readiness contract.
- Other must-keeps: htmx `hx-*` + OOB targets (`src/views/login.html:33`, `src/views/layout.html:370-371`, `:78`); Alpine `x-*`/`@*`/`:*` expressions (`layout.html:78,378-381`, globals `src/frontend/alpine-init.ts:23-26`); mustache/i18n placeholders (`src/routes/views/layout.ts:87-118`, `I18N_TEMPLATE_RE` `src/routes/views/constants.ts:15`); a11y `role`/`aria-*` (`layout.html:78`, `src/views/config.html:57`); CSP nonce hooks (`layout.html:53,63-70`, `layout.ts:111,123-126`); the locale-injection comment anchor (`layout.html:72`, consumed at `layout.ts:128-131`).
- Gate impact: no blocking gate catches attribute stripping in served HTML — see `scripts/check/parallel/gate-table.mjs:127,209,211,215` (same blind spot as the parity-gate ticket).

**Why deferred (low priority)**
Policy/documentation only — there is no live stripping at runtime (`src/build/compress.ts` build strip was removed in `5d815d825`; the runtime minifier never stripped testids). Codifying the contract is useful but not urgent.

**Acceptance criteria**

- [ ] A written policy enumerates the must-keep attribute classes above with the file:line evidence, colocated with the runtime response code or the plan docs.
- [ ] The policy states that removing `data-testid` requires renaming the contract and migrating all 7 production query sites plus the e2e selectors before any strip — not a build flag or env threshold.
- [ ] A regression test asserts the runtime minifier preserves `data-testid`, `hx-*`, `x-*`, `@*`, `:*`, `role`/`aria-*` and `nonce` on a representative fragment (extend `src/content/minify.test.ts`).
- [ ] No runtime stripping of any of these attributes is introduced.

**Verification command for the implementer**
`bun test src/content/minify.test.ts`, `bun run test:e2e:browser`, `bun run check:parallel --diff-base <base>`.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
