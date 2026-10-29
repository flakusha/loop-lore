<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TASK-web-aa-axe-ratchet

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-accessibility-input

**Summary:**

Owner epic: `.plan/epics/epic-accessibility-input.md` (In Progress, P0)

## Background

- Landmarks live: `src/views/layout.html:63-68` (toast `aria-live=polite`, skip-to-content link); `settings.html:51-53` `role=alert` errors.
- Motion: `src/frontend/a11y/responsive.ts:20-28` (`InputModeSnapshot`, reduced-motion queries at `:63-75`); `touch.ts:7-8,41-43` reduced-motion click fallback.
- Gap: `src/frontend/a11y/` contains ONLY `responsive.ts` + test - no focus trap/restore, no live-region announcer for htmx swaps, no contrast-token CSS. No axe spec, no CI ratchet (`@playwright/test ^1.64.1` present at `package.json:220`; axe absent).

Established solutions: Playwright first-party axe integration (one small dev-dep on existing suite) - https://playwright.dev/docs/accessibility-testing ; axe-core engine (de-facto WCAG 2.2 A/AA standard) - https://github.com/dequelabs/axe-core . Ratchet policy (fail only on NEW critical/serious vs baseline; start with 5 key views, tighten quarterly).

## Change

1. Deps (dev-only): `@axe-core/playwright`. New `e2e/axe.spec.ts`: render 5 key views (chat, settings, login, gallery, world-edit) via existing test harness, `injectAxe` + `checkA11y` with `wcag2aa` tag, write `e2e/__snapshots__/axe-baseline.json`.
2. Ratchet: CI step `bunx playwright test e2e/axe.spec.ts` compares critical+serious count vs baseline; fail iff count increases. `bun run a11y:update-baseline` regenerates after intentional fixes.
3. Fix pass bundled: missing focus-visible outline (2px), aria-labels on flagged icon-only buttons, one live-region announcer for `htmx:afterSwap` (`src/frontend/a11y/live-region.ts` ~30 lines). Full focus-trap module DEFERRED - only what the ratchet flags.

## Acceptance

- `e2e/axe.spec.ts` passes on 5 views with baseline recorded.
- Intentionally removing an aria-label fails CI with new-violation diff.
- Keyboard-only run: skip link to main, Esc closes modal, all icon buttons have accessible names.
- No new runtime deps; `responsive.ts`/`touch.ts` behavior unchanged.

**Caveats:** TOCTOU: baseline comparison uses same rendered commit; record view revisions alongside counts. Security: e2e harness serves fixture-only data. Parallelism: single writer for baseline file on update. Partial failure: one view failing to render must not mask others. Rollback: baseline is committed JSON, revert restores old gate. Stale state: baseline update requires explicit command + human review, never auto-heals. Observability: CI annotates new violations (rule, view, element).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
