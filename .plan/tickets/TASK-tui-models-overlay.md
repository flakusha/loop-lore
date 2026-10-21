<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI admin models overlay

**Status:** Done
**Priority:** medium
**Effort:** Large
**Epic:** `epic-terminal-ui`
**Tags:** tui, admin, models
**Summary:** Full-screen overlay for model-role assignment and provider health, so an operator over ssh can see which model each role actually resolved to and reassign it.
**Context:** The `admin.system` routes (`src/routes/admin/model-roles.ts`, `src/routes/admin/providers.ts`) already expose every role's resolved `provider`/`model` plus the `source` that decided it (`db` \| `config` \| `default`, `src/admin/model-roles.ts:34-39`). That `source` is the diagnostic an operator wants over ssh — "why isn't this using the model I set" — and nothing in the TUI surfaces it. Reuse-first: the overlay is built from the same blessed `box` + `list` + `text` shape as `chat-picker.ts`, the HTTP layer uses its own `setFetch` seam rather than `mock.module`, and the keybinding sits in the existing F-block in `src/tui/app.ts`. No new widget library, no second screen framework, no new server route.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [x] Overlay lists every resolved model role with its `source` (`db`/`config`/`default`), so an override that was never applied is visible.
- [x] Drill-down roles → providers → models commits a real `PUT /api/v1/admin/model-roles/:role`; `c` clears the override via `DELETE`; `r` re-scans providers via `POST /api/v1/admin/providers/rescan`.
- [x] Built from the blessed `box`/`list`/`text` shape already used at `src/tui/chat-picker.ts` and `src/tui/harness/index.ts:59,73,90` — no new widget library, no second screen framework.
- [x] Keybinding follows the `src/tui/app.ts` convention: **F6**, the next free key in the F-block (F4 stays reserved by `TASK-harness-topic-tui-surface`); Esc/q dismisses the overlay rather than quitting the shell.
- [x] Provider health, model count, latency and last error are rendered; a `403` from any admin route degrades to a plain "admin only" line instead of an error, since a non-admin opening the overlay is a normal state.
- [x] HTTP layer is exercisable through its own `setFetch` seam — no `mock.module`, so the tests run in a plain shared `bun test` like `chat-picker.test.ts`.
- [x] Selection is a single tracked `cursor` (blessed's own key handling is disabled) so Enter and `c` can never act on a different row than the one highlighted.
- [x] Row formatters live in `src/tui/models-display.ts`, mirroring the `harness/display.ts` split, keeping the widget under its size budget.
- [x] Tests cover the drill-down and commit path, the clear path, the re-scan path, cursor clamping, and the `403` degradation.
- [x] Web parity reference (`src/frontend/alpine/admin-models/`, rendered by `src/views/admin.html:855`) consulted for the endpoint shapes; no server route added.
- [x] `bun run check` green.

### Provider health (status bar) and connectivity ping

- [x] Provider reachability is a compact segment on the EXISTING status bar (`updateStatus`), not a new line of chrome — `Providers: 2/2 ok`, and the unreachable names are listed only when the count is short, capped at 3 plus an `+N` tail.
- [x] Fed by `GET /api/v1/providers`, the one provider route registered with no auth at all (`src/routes/admin/providers.ts:28-49`), so it works for a non-admin too.
- [x] Fetched once after boot and on the existing F5 refresh. No timer: a chat client does not hold a background interval open to redraw a status line.
- [x] A failed health fetch degrades the SEGMENT to `Providers: ?` and leaves the message untouched — the chat id and key hints survive a provider-list outage. Repaints only when the segment text actually changes.
- [x] `p` on a provider row pings `POST /api/v1/generation/test-connection` and shows the verdict in the overlay's existing status line. No new keybinding, no new overlay.
- [x] The ping route needs only `requireUserId`, so the handler is reachable without `admin.system`; a failed request renders its message rather than throwing. Pressing `p` off the providers level says so instead of silently doing nothing.
- [x] A DOWN provider answers HTTP 200 with `ok: false`, so the verdict is read off the body — the envelope's `ok` would report an outage as a success.
- [x] Reuses `models-api.ts`'s `call` helper and `setFetch` seam; no second HTTP seam for the same module.
- [x] Tests cover the segment format, the degradation, the non-clobbering guarantee (verified by mutation), and the ping's non-admin path.

## Deliberately not built

- **Temperature / maxTokens editors.** `PUT /model-roles/:role` accepts them, but they need free-text numeric entry with validation — that is a text-box surface, not a list surface, and the web client already does it.
- **Capabilities registry, plugin toggles, anything destructive.** Same reason: not a list-plus-a-selection.

## Related Files

- `src/tui/models-api.ts` (HTTP layer + `setFetch` seam), `src/tui/models-overlay.ts` (`ModelsOverlay`), `src/tui/models-display.ts` (row formatters)
- `src/tui/app.ts` (F6 binding, Esc dismissal, status hint)
- `src/routes/admin/model-roles.ts:38-51`, `src/routes/admin/providers.ts:51-76`, `src/admin/model-roles.ts:34-39` (field shapes and `source`)
- `src/tui/chat-picker.ts`, `src/tui/harness/index.ts:59,73,90`, `src/tui/harness/display.ts` (reused shapes)
- `TASK-tui-chat-picker`, `TASK-harness-topic-tui-surface`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

## Correction (2026-10-16): the Done claim on this ticket was partly false

The original Done did not hold up under verification against real `blessed`, and
the record should say so rather than quietly stand corrected.

- **The HINTS footer never worked.** Handlers were bound on `this.box`, but
  `show()` called `this.list.focus()` — and the list is constructed with
  `keys: false`, so it was never keyable. `Screen._listenKeys` dispatches
  element keys only to the focused element (`widgets/screen.js:601`), so `c`,
  `p`, `r`, the arrows and Enter were all unreachable by keyboard. Only the
  mouse path (`list.on("select")`) worked. `show()` now focuses the box, where
  the bindings actually live.
- **A related, independent cause made it worse:** the chat textbox used
  `inputOnFocus`, which raised `screen.grabKeys`, and that flag gates every
  screen-level key (`widgets/screen.js:591`). That is the other half of the
  fix and lives in `src/tui/chat/index.ts`.
- **"Esc: back" was never implemented and never will be by this ticket.**
  Esc is not bound inside the overlay at all; it reaches the app's global
  dismiss chain and closes the whole overlay from every level. The footer
  promised a level-step-back that did not exist. The claim was deleted rather
  than implemented, and the footer now says "Esc: close" at all three levels.

The drill-down itself was sound and is unchanged; only its keyboard reachability
and the footer's honesty were wrong.

## Known-branch-red: the `tickets` gate

On this branch `bun run plan:validate` is **expected-red** at exactly one gate — `tickets`, with `ticket index out of sync` and 6 orphan `.md` files. This is structural, not a defect: `giwt sync` refuses to write `index.json` from a linked worktree (it reports "index write deferred — linked worktree; regenerated post-merge on the target branch"), so the index cannot converge until this branch merges. Do not re-run `bun run plan:sync:fix` to chase it — that run changed no orphan count and instead rewrote four unrelated tickets' statuses into the worktree, where they were discarded as collateral. Every other gate (`format`, `code-map`, `status-vocab`, `links`, `spdx`, `naming`, `epics-doc`, `matrix`, `backlog`) must stay OK.
