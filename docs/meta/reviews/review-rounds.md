# Code Review Rounds — Status Summary

## Review history: 3 rounds (2026-07-05 through 2026-07-06)

**139 findings total.** A verification pass on 2026-07-10 confirmed the large
majority were already resolved in code. Open items migrated to
[../open-items.md](../open-items.md) and [../plan.md](../plan.md).

## Round 1 — Full Code Review (92 findings, 85 files)

**Result**: All 🔴 (38) and 🟡 (85) items addressed. Fixes verified in code.

Key areas: Auth/ownership checks on all routes, XSS via DOMPurify,
data loss in generation route, HTML parse errors, config/DB hardening,
CSS duplicates, UI dead elements, rate limiting, race conditions, input
validation, regex bug, provider system (bedrock deleted), silent catches,
test flakiness.

## Round 2 — FE/BE Review (24 findings)

**Result**: All 🔴 (4) and 🟡 (18) items addressed. 2 nits fixed.

Critical: missing `x-data` on settings, `confirmDeleteText` missing from
return, chat-list CSS rules, gallery drop-zone click handler. All fixed.

## Round 3 — Unexplored Areas (23 findings, 23 fixes applied)

**Result**: 7 🔴 applied, 16 🟡 applied. Remaining items migrated to
open-items.md and plan.md.

Key items fixed: migration constraints, path traversal, zstd type safety,
TUI auth wiring, age-gate singleton, prompt-assembler improvements.

## Round 4 — Alpine.js + htmx Integration (11 findings, 2026-07-12)

**Result**: 3 🔴, 3 🟡, 2 🔵 applied. 3 info-only items noted.

Key fixes: keydown listener leak in chat destroy(), double-toast from
duplicate `show-toast` listeners, settings page dual-init (Alpine + vanilla
JS page-loader), `initTree` missing root `x-data`, duplicate store
initialization, notifications handler cleanup.

See [alpine-htmx-integration.md](alpine-htmx-integration.md) for full
details.

## Round 5 — Test Suite Coverage Audit (2026-07-12)

**Result**: 12 findings. ~25% file-level coverage across `src/`. E2E suite has
concrete gaps in isolation, error shape validation, and generation control
paths. Documentation written; fixes not yet applied.

### Coverage Landscape

- **69 test files** (42 unit + 27 e2e). ~165 source files total.
- **17 quick-win untested files** — pure logic, zero dependencies (~1,400 lines)
- **7 story module files untested** — quest-engine, quality-evaluator,
  turn-manager, world-state, events/* (largest gap by line count)
- **~20 route handler files** — tested only through full HTTP e2e, no unit-level
  handler tests
- **Personas module** — complete CRUD feature, zero tests
- **Browser e2e functional gaps** — no message-send flow, no full auth flow,
  no chat creation flow

### E2E Quality Findings

| ID      | Severity | Finding                                      |
| ------- | -------- | -------------------------------------------- |
| TEST.1  | High     | No cross-tenant isolation tests              |
| TEST.2  | High     | Error envelope shape never asserted          |
| TEST.3  | Medium   | No cancel-during-generation test             |
| TEST.4  | Medium   | No generation idempotency test               |
| TEST.5  | Medium   | Test ordering fragile (shared mutable state) |
| TEST.6  | Medium   | Browser auth flow incomplete (3 tests)       |
| TEST.7  | Medium   | Browser chat flow sends no messages          |
| TEST.8  | Medium   | 17 quick-win source files untested           |
| TEST.9  | Medium   | Story module nearly untested (7 files)       |
| TEST.10 | Low      | Personas module untested                     |
| TEST.11 | Low      | Route handler isolation missing              |
| TEST.12 | Low      | RPG mechanics no tests                       |

Findings tracked in [../open-items.md](../open-items.md) (TEST.1–TEST.12).
Full E2E review and coverage gap analysis in
[../../spec/testing.md](../../spec/testing.md).

## Open Items

See [../open-items.md](../open-items.md) for remaining tracked items:

- TEST.1 through TEST.12 — test coverage debt
- ENUM.1, MIGRATION.1, MIGRATION.2 — schema/db low-priority
- CAST.1 through CAST.6 — validation and type safety
- ASSISTANT.1 through ASSISTANT.3 — prompt assembler fixes
- TUI.1 through TUI.3 — terminal UI polish
- AGE.1, BUILD.1 — minor fixes
