<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extend the TUI into a live /api/v1 contract smoke suite

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** `epic-experimental-egui-frontend`
**Tags:** tui, testing, api, client-contract
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`, `.plan/epics/epic-terminal-ui.md`, `.plan/tickets/TASK-frontend-client-contract-doc.md`, `.plan/tickets/TASK-frontend-view-model-json-negotiation.md`
**Summary:** Add a suite that drives the real Elysia app through the endpoints the TUI parses, so an API shape change fails a test instead of silently breaking a screen.
**Context:** The TUI is already the reference non-htmx client (`src/tui/`), which `docs/meta/code-practices-improvements/07-alternative-frontend-support.md:8-13` and §Recommendations item 5 both single out: "Keep TUI as the reference alt-client. Its tests double as API contract smoke tests." Today every TUI test stubs `globalThis.fetch` — `src/tui/chat/api.ts` exposes a `setFetch` seam and `src/tui/harness/api.ts` does too — so the suite proves the TUI parses what it was *told*, not what the server *sends*. A shape drift between `src/routes/v1/` and `src/tui/*/api.ts` is currently invisible until a human runs the TUI. This ticket closes that gap for the endpoints the TUI already calls, which is the cheapest live contract coverage available; it does not add TUI screens.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- A live suite that boots the real app (the same way existing integration
  suites do) and exercises the endpoints `src/tui/` consumes:
  `POST /api/v1/chats/:id/messages`, `GET /api/v1/chats/:id/messages`,
  `GET /api/v1/assets?entity_type=chat&entity_id=…`,
  `GET /api/v1/harness/runs`, `GET /api/v1/harness/runs/:runId`.
- Assert the response shape matches what `src/tui/chat/api.ts` and
  `src/tui/harness/api.ts` actually parse — field-by-field, not a snapshot.
- Run against an isolated database, following the pattern the repo already
  uses for its own integration suites.

## Out of Scope

- Adding TUI screens or widgets (`epic-terminal-ui.md` owns those).
- Full API coverage. This covers the TUI's footprint only.
- SSE. The TUI polls today; see §Open question 4 of
  `docs/meta/research/egui-frontend-adoption.md`.

## Acceptance Criteria

- [ ] A suite drives the real app through all five endpoints in §Scope and
  asserts, per endpoint, every field the corresponding TUI module reads.
- [ ] The suite runs without `mock.module` fetch stubbing — a test that stubs
  fetch does not count toward this ticket.
- [ ] Removing or renaming a field the TUI reads in `src/routes/v1/` makes the
  suite fail. Demonstrated by a one-line temporary rename, recorded in the
  ticket's Resolution, then reverted.
- [ ] The suite uses an isolated database and leaves no fixture rows behind;
  it is safe to run alongside the rest of the suite.
- [ ] `bun test src/tui/` exits 0.
- [ ] No production behaviour change under `src/tui/` — this is tests only.

## Related Files

- `src/tui/chat/api.ts` — `setFetch` seam, message endpoints
- `src/tui/harness/api.ts` — `setFetch` seam, harness endpoints
- `src/tui/asset-view.ts:206` — the assets call
- `docs/meta/code-practices-improvements/07-alternative-frontend-support.md` —
  recommendation 5, which this implements

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*