<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION: Browser e2e coverage expansion — Playwright integration

**Status:** 🟡 In Progress — umbrella; work split into 4 child tickets (open, harness first)
**Priority:** High
**Effort:** Large
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, playwright
**Epic:** epic-testing-qa

## Summary

Investigate current browser e2e coverage (7 `*.browser.ts` files, 40 cases) and add new test cases for untested views/flows. Worktree: `tree/test-playwright-integration-updates` (branch `test/playwright-integration-updates`).

## Child Tickets

| Ticket                        | Scope                                                                  | Order |
| ----------------------------- | ---------------------------------------------------------------------- | ----- |
| `TASK-e2e-playwright-harness.md`    | P0 harness hardening: error assertions, page isolation, Alpine helpers, wait migration | 1st — prereq for all |
| `TASK-e2e-auth-flows.md`            | Registration/auth/login/logout, join/invite flows, redirection + redirect-loop fix | 2nd |
| `TASK-e2e-view-expansion.md`        | Uncovered views, creation-menu persistence, settings, gallery, docs deferral | 3rd |
| `TASK-e2e-state-contracts.md`       | Alpine state contracts, encryption flow, access correctness, search/filtering | 4th |

## Coverage Investigation (2026-08-06) — shared context

### What the 7 browser suites cover today

| Suite                        | Cases | What it asserts                                                                                                                                                                                                      |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.browser.ts`           | 10    | Per-view presence: chat, characters, gallery, settings, worlds, new-chat, login, layout/nav (testid existence only)                                                                                                  |
| `navigation.browser.ts`      | ~8    | Sidebar htmx nav, hamburger toggle, header-slot integrity, new-chat create+redirect, settings shell, login presence                                                                                                  |
| `htmx-alpine.browser.ts`     | ~13   | htmx→Alpine init, morph state reset, Escape-key panel close, htmx modal lazy-load (characters create, gallery upload), toast dedup, sidebar store sync, chat-list selection, chat-settings + user-preferences modals |
| `characters-flow.browser.ts` | ~5    | Grid load, create/import modal open, detail modal open, start-chat redirect                                                                                                                                          |
| `worlds-flow.browser.ts`     | ~4    | List load, create modal open + fields, seeded list render, world-card → detail nav                                                                                                                                   |
| `chat-flow.browser.ts`       | ~5    | Panel/toggle presence, message input/send/attach/form presence, chat-list template, cancel-generation                                                                                                                |
| `auth-flow.browser.ts`       | 4     | Login form render, demo-login `hx-post`, signup link, invalid-login htmx error swap                                                                                                                                  |

### Structural gaps (all 7 files)

Owned by `TASK-e2e-playwright-harness.md`; summarized here as shared context:

1. **No end-to-end data mutation through the UI.**
2. **No console/pageerror assertion.**
3. **Sleep-based waits dominate.**
4. **No per-test page cleanup** (`TASK-browser-test-isolation`).
5. **Component-local Alpine state never read** (`TASK-alpine-state-testing`).
6. **`playwright.config.ts` is dead config** (`TASK-resolve-playwright-cfg`).

### Views with NO browser coverage at all

See the per-view table in `TASK-e2e-view-expansion.md` (register flow lives in `TASK-e2e-auth-flows.md`).

### High-Value Topic Matrix (2026-08-06) — distribution

API-level e2e coverage (`tests/e2e/flows/*.test.ts`) exists for ALL 11 topics; **browser/UI-level coverage was ZERO for all of them**. Topic details moved verbatim into child tickets:

| Topic | Child ticket |
| ----- | ------------ |
| 1. Chat compression-encryption-decryption-decompression | TASK-e2e-state-contracts |
| 2. Registration flow | TASK-e2e-auth-flows |
| 3. Authorization flow | TASK-e2e-auth-flows |
| 4. Join/invite flow | TASK-e2e-auth-flows |
| 5. All creation menus (character, world, location, chat) | TASK-e2e-view-expansion |
| 6. Settings menus and modals | TASK-e2e-view-expansion |
| 7. Docs endpoint linkage + docs generation | TASK-e2e-view-expansion (deferred — unreachable in harness) |
| 8. Redirection | TASK-e2e-auth-flows |
| 9. Access correctness | TASK-e2e-state-contracts |
| 10. Gallery, previews, assets interactions, chat gallery | TASK-e2e-view-expansion |
| 11. Search / filtering | TASK-e2e-state-contracts |

**Cross-cutting gaps (all topics):** no `assertNoPageErrors` anywhere; no persisted-result assertions; fixed sleeps — owned by `TASK-e2e-playwright-harness.md`.

### Current baseline (this worktree, `bdea77f8`, 2026-08-06 run)

81 pass / 1 fail / 1 error across 7 suites; the only failing suite is `auth-flow` (auth redirect loop). Per-suite table and root-cause analysis live in `TASK-e2e-playwright-harness.md` (baseline) and `TASK-e2e-auth-flows.md` (redirect loop).

## Dependencies

- `TASK-browser-console-assert`, `TASK-browser-test-isolation`, `TASK-alpine-state-testing` — shared helpers (harness child)
- `BUG-alpine-init-hydration` — blocks chat-list selection assertions until fixed
- `TASK-PLAN-E2E-STABILIZATION` — auth redirect loop blocks `auth-flow` green (auth-flows child)
