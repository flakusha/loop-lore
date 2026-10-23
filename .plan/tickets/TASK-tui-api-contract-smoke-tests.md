<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extend the TUI into a live /api/v1 contract smoke suite

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-experimental-egui-frontend
**Tags:** tui, testing, api, client-contract
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`, `.plan/epics/epic-terminal-ui.md`, `.plan/tickets/TASK-frontend-client-contract-doc.md`, `.plan/tickets/TASK-frontend-view-model-json-negotiation.md`
**Summary:** Add a suite that drives the real Elysia app through the endpoints the TUI parses, so an API shape change fails a test instead of silently breaking a screen.
**Context:** The TUI is already the reference non-htmx client (`src/tui/`), which `docs/meta/code-practices-improvements/07-alternative-frontend-support.md:8-10` and §Recommendations item 5 both single out: "Keep TUI as the reference alt-client. Its tests double as API contract smoke tests." Today every TUI test stubs `globalThis.fetch` — `src/tui/chat/api.ts` exposes a `setFetch` seam and `src/tui/harness/api.ts` does too — so the suite proves the TUI parses what it was *told*, not what the server *sends*. A shape drift between `src/routes/v1/` and `src/tui/*/api.ts` is currently invisible until a human runs the TUI. This ticket closes that gap for the endpoints the TUI already calls, which is the cheapest live contract coverage available; it does not add TUI screens.
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

- [x] A suite drives the real app through all five endpoints in §Scope and
  asserts, per endpoint, every field the corresponding TUI module reads.
- [x] The suite runs without `mock.module` fetch stubbing — a test that stubs
  fetch does not count toward this ticket.
- [x] Removing or renaming a field the TUI reads in `src/routes/v1/` makes the
  suite fail. Demonstrated by a one-line temporary rename, recorded in the
  ticket's Resolution, then reverted.
- [x] The suite uses an isolated database and leaves no fixture rows behind;
  it is safe to run alongside the rest of the suite.
- [x] `bun test src/tui/` exits 0.
- [x] No production behaviour change under `src/tui/` — this is tests only.

## Related Files

- `src/tui/chat/api.ts` — `setFetch` seam, message endpoints
- `src/tui/harness/api.ts` — `setFetch` seam, harness endpoints
- `src/tui/asset-view.ts:232` — the assets call
- `docs/meta/code-practices-improvements/07-alternative-frontend-support.md` —
  recommendation 5, which this implements

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

## Resolution

Landed as `src/tui/api-contract.test.ts` (worktree `test-tui-api-contract-smoke`,
branch `test-tui-api-contract-smoke`). Tests only — nothing under `src/tui/`
outside the new test file changed.

### Boot harness reused

`src/routes/v1/v1-enforcement.test.ts:45-72` — `createTestDb()` for the
in-memory DB, `loadConfig()` with cron disabled, then `createApp({ database,
config, asyncStore })` and `app.handle(new Request(...))`. That harness already
boots the REAL composed app (registerPlugins + the v1 barrel + catch-all)
in-process with no `Bun.serve`, no shared path/port and no `mock.module`, which is
exactly what the ticket's "boots the real app" clause asks for. Inventing a
second boot path would have risked testing a route plugin in isolation, which is
the weaker guarantee the ticket is written against.

### Fields asserted, per endpoint

Every field below is read by the named TUI module; the suite asserts each one
individually (no snapshot blob).

- `POST /api/v1/chats/:id/messages` — `src/tui/chat/api.ts` `handleSend`:
  `id` (non-empty string, and re-readable as a real `messages` row), and
  `assistantMessage` **absent** when no auto-reply ran (`if (data.assistantMessage)`
  is the only branch on it).
- `GET /api/v1/chats/:id/messages` — `src/tui/chat/api.ts` `loadMessages`:
  envelope `data` (array) and `cursor` (must stay absent, so
  `data.cursor ?? host.cursor` keeps the host cursor); per row `id`, `role`,
  `content` (strings) and `actorName` (string when present) — the last drives
  the prefix in `chat/display.ts` `formatMessageLine`.
- `GET /api/v1/assets?entity_type=chat&entity_id=…` — `src/tui/asset-view.ts`
  `loadAssets`/`renderCurrent`: envelope `data`, per asset `id`, `filename`,
  `mime_type`, `asset_type`, `size_bytes` (number), `created_at` (sliceable to
  `YYYY-MM-DD`), `alt_text` (string when not null).
- `GET /api/v1/harness/runs` — `src/tui/harness/api.ts` `loadRuns` +
  `harness/display.ts` `formatRunLine`: envelope `items`, per row `runId`, `ts`,
  `durationMs` (number, never the persisted `runMs`), `task`, `taskType`,
  `model`, `result`, `tokensIn`, `tokensOut`, `costUsd` (number, 0 when unpriced).
- `GET /api/v1/harness/runs/:runId` — `src/tui/harness/api.ts` `loadRunDetail`
  feeding `formatRunDetail`: all of the above plus `error`, `toolCount`, `tools`
  (array — `tools.join(", ")` would throw without it), `pattern`, `patternDetail`,
  `toolingGap`, `msg`, `branch`, `gitSha`, `pid`, `turnId`; plus a cross-endpoint
  agreement check on the shared summary fields.

### Mutation proof (fail → revert, both directions)

Mutation A — `src/routes/messages/create-response.ts:47`, the field
`handleSend` reads for the user-message id:

```diff
-  return jsonCreated({ id, context, },);
+  return jsonCreated({ messageId: id, context, },);
```

`bun test src/tui/api-contract.test.ts` → exit 1:

```
[FAIL] FAILURES:
  (fail) POST /api/v1/chats/:id/messages — chat/api.ts handleSend reads > returns the id of the persisted user message as a non-empty string [27.08ms]
  (fail) POST /api/v1/chats/:id/messages — chat/api.ts handleSend reads > persisted the turn under the returned id, so the id is not a uuid the caller cannot re-read [1.26ms]
  error: expect(received).toBe(expected)
  Expected: "string"
  Received: "undefined"
  at src/tui/api-contract.test.ts:146:29
  error: expect(received).toBe(expected)
  Expected: "contract: durable turn"
  Received: undefined
  at src/tui/api-contract.test.ts:171:27

SUMMARY:
  10 pass
  2 fail
```

Mutation B — `src/routes/harness/index.ts:71`, the envelope key
`loadRuns` reads:

```diff
-          return jsonResponse({ items: items.map(toSummary,), },);
+          return jsonResponse({ runs: items.map(toSummary,), },);
```

`bun test src/tui/api-contract.test.ts` → exit 1:

```
[FAIL] FAILURES:
  (fail) GET /api/v1/harness/runs — harness/api.ts loadRuns reads > returns { items } with every summary field formatRunLine renders [7.74ms]
  (fail) GET /api/v1/harness/runs — harness/api.ts loadRuns reads > never leaks the persisted runMs key the TUI does not read [0.52ms]
  (fail) GET /api/v1/harness/runs/:runId — harness/api.ts loadRunDetail reads > agrees with the list endpoint on the shared summary fields [0.76ms]
  error: expect(received).toBe(expected)
  Expected: true
  Received: false
  at src/tui/api-contract.test.ts:345:40

SUMMARY:
  9 pass
  3 fail
```

Both mutations were reverted. `git status --porcelain` after the revert shows
only the new test file and this ticket — `src/routes/` is byte-identical to the
base commit. Re-running the suite after the revert is green (12/12).

### Isolation

The database is an in-memory SQLite created by `createTestDb()` and owned by
this file alone (`db.destroy()` in `afterAll`) — no fixture rows can survive into
another test file. The harness endpoints are file-backed rather than DB-backed,
so each of the two harness describes mkdtemps its own `.tmp/tui-api-contract/fixture-*`
directory in `beforeEach`, writes one real JSONL line built by the real recorder
(`buildRunRecord`) and serializer (`serializeRun`), points the reader at it with
`setExecLogPath`, then removes the directory and resets the process-wide pointer
to `null` in `afterEach`. Cron is disabled. Verified green both standalone and
inside the full `src/` run, with no new failures.

### Commands run

| Command | Result |
| --- | --- |
| `bun test src/tui/api-contract.test.ts` | exit 0 — 12 pass |
| `bun test src/tui/` | exit 0 — 101 pass, 76 skip, 0 fail |
| `bun test src/` | exit 1 — 17183 pass, 1624 skip, **25 fail (all pre-existing, see below)** |
| `bun run typecheck` | exit 0 |
| `bun run lint:eslint` | exit 0 — 0 errors (2355 pre-existing warnings) |
| `bun run md:lint` | exit 0 — 0 issues |
| `bun run plan:validate` | exit 1 — 1 error, pre-existing (see below) |

### Pre-existing failures (not caused by this change)

`bun test src/` reports 25 failures, all order-dependent global-state leaks in
the web frontend cluster. The **same 25** fail with the new suite removed from
the tree (`17171 pass / 25 fail / 18820 tests` without it, `17183 pass / 25 fail /
18832 tests` with it — the delta is exactly this suite's 12 tests, and the
failing set is byte-identical). They also all pass when their own files are run
alone, confirming cross-file leakage rather than a real regression:
`src/frontend/alpine/travel-interface.test.ts`,
`src/frontend/alpine/world-fetch.test.ts`,
`src/frontend/alpine/world-locations.test.ts`,
`src/frontend/alpine/world-page-state.test.ts`,
`src/frontend/pages/characters.test.ts`,
`src/frontend/vn/scene-renderer/render-scene.test.ts`.

`bun run plan:validate` exits 1 on a ticket-index lag that is already red on
`dev`: `Index status lags an appended .md done-marker (fixable): TASK-FRONTEND-CLIENT-CONTRACT-DOC`
→ `✗ tickets FAIL — ticket index out of sync — run giwt sync to reconcile`.
Verified identical on the untouched dev checkout. Reconciling it needs `giwt sync`,
which belongs to branch finalization, not to this commit.

### Not run

`bun run check` (the full parallel gate suite) was **not** run — no time budget
for it. The individual gates it wraps that matter here (typecheck, eslint, md
lint, unit suite, plan validation) were run directly and are reported above.

git issue: 74b3261
