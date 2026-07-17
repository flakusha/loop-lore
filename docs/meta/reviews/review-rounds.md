# Code Review Rounds — Status Summary

3 rounds (2026-07-05 through 2026-07-06). 139 findings total. Verification pass on 2026-07-10 confirmed majority resolved. Open items migrated to `open-items.md` and `plan.md`.

## Round 1 — Full Code Review (92 findings, 85 files)

All 🔴 (38) and 🟡 (85) items addressed. Key areas: auth/ownership checks, XSS via DOMPurify, data loss in generation route, HTML parse errors, config/DB hardening, CSS duplicates, UI dead elements, rate limiting, race conditions, input validation, regex bug, provider system, silent catches, test flakiness.

## Round 2 — FE/BE Review (24 findings)

All 🔴 (4) and 🟡 (18) items addressed. 2 nits fixed. Critical: missing `x-data` on settings, `confirmDeleteText` missing from return, chat-list CSS rules, gallery drop-zone click handler.

## Round 3 — Unexplored Areas (23 findings, 23 fixes applied)

7 🔴 applied, 16 🟡 applied. Key fixes: migration constraints, path traversal, zstd type safety, TUI auth wiring, age-gate singleton, prompt-assembler improvements.

## Round 4 — Alpine.js + htmx Integration (11 findings, 2026-07-12)

3 🔴, 3 🟡, 2 🔵 applied. 3 info-only. See `alpine-htmx-integration.md` for full detail.

## Round 5 — Test Suite Coverage Audit (2026-07-12)

12 findings. ~25% file-level coverage. 69 test files (42 unit + 27 e2e). ~165 source files total.

### Coverage Gaps

- 17 quick-win untested files (~1,400 lines pure logic)
- 7 story module files untested (quest-engine, quality-evaluator, turn-manager, world-state, events/*)
- ~20 route handler files — only HTTP e2e, no unit-level
- Personas module — complete CRUD, zero tests
- Browser e2e: no message-send flow, no full auth flow, no chat creation flow

### E2E Quality Findings

| ID      | Severity | Finding                                  |
| ------- | -------- | ---------------------------------------- |
| TEST.1  | High     | No cross-tenant isolation tests          |
| TEST.2  | High     | Error envelope shape never asserted      |
| TEST.3  | Medium   | No cancel-during-generation test         |
| TEST.4  | Medium   | No generation idempotency test           |
| TEST.5  | Medium   | Test ordering fragile (shared state)     |
| TEST.6  | Medium   | Browser auth flow incomplete (3 tests)   |
| TEST.7  | Medium   | Browser chat flow sends no messages      |
| TEST.8  | Medium   | 17 quick-win source files untested       |
| TEST.9  | Medium   | Story module nearly untested (7 files)   |
| TEST.10 | Low      | Personas module untested                 |
| TEST.11 | Low      | Route handler isolation missing          |
| TEST.12 | Low      | RPG mechanics no tests                   |

Tracked in `open-items.md` (TEST.1–TEST.12). Full E2E analysis in `../../spec/testing.md`.

## Open Items

See `open-items.md` for remaining: TEST.1–TEST.12, ENUM.1, MIGRATION.1, MIGRATION.2, CAST.1–CAST.6, ASSISTANT.1–ASSISTANT.3, TUI.1–TUI.3, AGE.1, BUILD.1.