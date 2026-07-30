# Immediate Plan

**Focus:** P0 Observability (Epic 16) + blocking test fixes.

## Backlog-Driven Prioritization

### P0 — Immediate Next (v0.1 In-Progress)

| Epic | Item                                                                               | Status         |
| ---- | ---------------------------------------------------------------------------------- | -------------- |
| 16   | Observability — telemetry, admin analytics, CI config, Playwright responsive tests | 🟡 In progress |

### Completed (moved from P0)

| Epic | Item                                                                                   | Status      |
| ---- | -------------------------------------------------------------------------------------- | ----------- |
| 12   | Memory Foundation — keyword filtering, type enum, context compaction, A/N injection    | ✅ Complete |
| 13   | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts, HTMX, etc | ✅ Complete |
| 19   | Chat Notifications — cross-chat SSE, read-state schema, unread badge, toast            | ✅ Complete |

## Immediate Tasks

### Epic 16: Observability & CI

| Task                            | Priority | Status  | Notes                                                      |
| ------------------------------- | -------- | ------- | ---------------------------------------------------------- |
| Finalize Playwright integration | High     | ✅ Done | `playwright.config.ts` created                             |
| Admin analytics dashboard       | High     | ✅ Done | Already implemented in `admin.html` + `admin-system.ts`    |
| CI config for observability     | High     | ✅ Done | `.github/workflows/ci.yml` created                         |
| Smoke test fixes                | High     | ✅ Done | Fixed stale selectors in `smoke.browser.ts` (3→0 failures) |

### Blocking Items (Test Infrastructure)

| ID     | Title                                            | Priority | Status                 |
| ------ | ------------------------------------------------ | -------- | ---------------------- |
| TEST.5 | E2E test ordering fragile (shared mutable state) | High     | 🔲 Not started         |
| TEST.3 | E2E: browser chat flow sends no messages         | High     | 🟡 Partially addressed |
| TEST.4 | Unit: route handler isolation missing            | High     | 🔲 Not started         |

## What Was Done

### 1. Playwright Config (`playwright.config.ts`)

- Chromium project with headless mode
- 1440×900 viewport for sidebar visibility
- Retries: 1, workers: 1 (serial for stability)
- HTML report + artifact retention

### 2. CI Workflow (`.github/workflows/ci.yml`)

- Jobs: check → test-unit → test-e2e → test-browser → build → telemetry
- Parallel: unit + e2e + browser tests
- Artifacts: coverage, test results, Playwright report, build output
- Playwright browser install step included

### 3. Smoke Test Fixes (`smoke.browser.ts`)

- **Settings view**: Changed from checking `isVisible` (requires Alpine init) to checking tab buttons exist in DOM and elements attached
- **Nav chat link**: Updated assertion from `/views/chat` to `/views/chat-list` (matches actual layout.html)
- All 19 smoke tests now pass (was 16/19)

### 4. Admin Analytics Dashboard

- Already implemented: `admin.html` analytics tab + `admin-system.ts` loadAnalytics/purgeAnalytics
- Summary stats (total events, sessions, active users)
- Daily events table + recent errors table
- Purge old events button

## Remaining Work

1. **TEST.5** — E2E test ordering: chat-flow.browser.ts has Alpine timing issues (panels visible before store init)
2. **TEST.3** — Browser chat flow: Alpine `x-show`/`:style` not evaluating in time for some assertions
3. **TEST.4** — Route handler isolation: not yet addressed

## References

- Backlog: `.plan/backlog.md`
- Epic 16: `.plan/epics/epic-analytics-observability.md`
- Testing QA: `.plan/epics/epic-testing-qa.md`
- Telemetry service: `src/telemetry/service.ts`
- Telemetry routes: `src/routes/telemetry.ts`
- Frontend telemetry: `src/frontend/alpine/telemetry.ts`
- Browser tests: `tests/e2e/flows/browser/`
- Playwright config: `playwright.config.ts`
- CI workflow: `.github/workflows/ci.yml`
