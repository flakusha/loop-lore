<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Browser-Side Terminal `$EDITOR` Support

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** web, terminal, pty, editor, harness, sandbox, websocket, bun
**Overview:** (see sections below)

## Summary

Let the loop-lore web UI hand a text buffer to the user's *actual* `$EDITOR`
(vim/neovim/emacs/helix/…) instead of the browser textarea, and — in the harness
case — open the sandboxed run folder in that editor with file navigation.

Two hard facts from discovery (2026-10-30, `tree/web-editor-term`, three
verification scouts, read-only):

1. **No PTY/WebSocket/editor code exists in `src/`.** No `node-pty`, no `xterm`,
   no `ws` dep (`package.json:191-214`); `src/transport/ws.ts` is a *client-side*
   socket holder (`connect()`/`attach(ws)`, `:66-91`) with raw `send()` passthrough
   (`:118-135`), no framing, no receive path, no server route; the `src/transport/`
   barrel is knip-ignored as unwired (`knip.json:164-171`).
2. **Bun's native PTY covers the backend with zero new deps** — verified against
   real binaries: `Bun.spawn({ terminal })` works from Bun **1.3.5** up
   (`bun-types/bun.d.ts:8064`, `TerminalOptions :8805`, `Terminal :8868`);
   `Bun.spawnSync` + `terminal` throws. But CI pins **1.2.x**
   (`.github/workflows/ci.yml:25`) where `terminal` is *silently ignored*
   (`proc.terminal === undefined`, child gets a pipe) — the feature would appear
   to work while `$EDITOR` sees no TTY. **The CI floor must move to >=1.4.0**
   (also needed for Windows ConPTY) or the route must feature-detect
   (`typeof Bun.Terminal === "function"`) and refuse.

Server-shape constraint (verified by reproduction): `src/server/start.ts:164`
runs `Bun.serve({ fetch: handleGatedRequest })`, **not** `app.listen()` — under
that shape an Elysia `.ws()` route **fails to upgrade**. The working path is
`Bun.serve`'s native `websocket:` handler + `server.upgrade(req)` in `fetch`.

## Scope

- `src/config/sections/web.ts` (new `web.editor` + `web.terminal.*` section,
  following the `tui` triple pattern `sections/tui.ts:6-50` through the
  4-point registration: factory, env-map, json-schema, barrel).
- A `WS /api/v1/terminal` route gated by `requirePermission("admin.system")`
  (`src/middleware/permissions.ts:83-86`, `app.guard` pattern at
  `src/routes/build-id.ts:59-62`), localhost-only by default.
- Frontend: `editorUrl()` helper + "open in $EDITOR" buttons at the six
  verified text-edit surfaces (see Architecture); an xterm.js panel for the PTY.
- Harness sandbox file tree: `GET /api/v1/harness/runs/:id/files`
  (read-only, path-traversal-safe) + "open sandbox in $EDITOR".

## Out of Scope

- A browser code editor (Monaco/CodeMirror) — the user's `$EDITOR` wins; a
  second editor competes with it and its config. Defer indefinitely.
- LSP-over-WebSocket proxy — deferred until A+B ship *and* a user demonstrably
  has no local editor.
- Multi-user terminal sharing / collaboration — one PTY per session.
- Terminal recording/replay — harness exec-log covers audit.
- Arbitrary shell over the socket — the route spawns a fixed allowlisted
  command (`$EDITOR <file>`), not a shell (see Security).

## Current State (verified 2026-10-30)

- Web UI edits in browser textareas only: blog create (`src/views/blog.html:52-62`,
  `textarea#blog-form-body`), character create
  (`src/partials/characters/create-modal.html:41-102`, five textareas),
  character edit (server-generated, `src/routes/views/character-edit-form.ts:132-176`),
  template payload (`src/components/modals/settings.html:256-269`),
  per-chat prompt override (`src/components/chat/chat-settings-modal.html:784-796`,
  no `id` — selector via testid), settings custom instructions
  (`src/components/modals/settings.html:120-132`), plus the recurring
  `textarea` + `textToolbar({target})` flex-row pattern (`src/components/text-toolbar.html:23-113`).
- No `window.__CONFIG__`, no `/api/config`; config reaches the frontend via
  inline-script bootstrap (`src/views/layout.html:43,53-58` +
  `src/routes/views/layout.ts:52-101`) or the role-gated catalog API
  (`GET|PATCH /api/v1/config-menu`, `src/routes/config-menu.ts:7-8`).
- Harness records exist (`src/harness/exec-log.ts`, `query.ts`, `stats.ts`) but
  no file-tree/LSP surface and no `/files` route.
- The async sandbox cite is `src/async/spill.ts:16-28`
  (`SPILL_ROOT = .tmp/async-store`, per-pid namespace) — repo-local, not
  `os.tmpdir()`; `src/async/offload.ts` is a re-export barrel only.
- The creative-tool-bridge epic owns *desktop creative apps over MCP*
  (`epic-external-creative-tool-bridge.md:45-55`) and the MCP client does not
  exist (`:24`); an `open_in_editor` MCP tool is a new proposal, not reuse of B1.
- No `isWithin(root, p)` path guard exists in `src/` (checked `src/assets/`;
  only buffer-prefix `startsWith`) — the budget must include writing one.
- No `Bun.version` runtime guard exists anywhere in `src/` — nothing today
  would catch the 1.2.x silent-ignore.

## Architecture

### A — URI-scheme "open in editor" (zero deps, ship first)

`editorUrl(path, line?, editor)` helper → `<a href="vscode://file/…">`
(`zed://`, `cursor://`, `idea://` variants). Cheapest read-only path for the
editor preference: one new inline-script global in
`src/routes/views/layout.ts` (pattern: `__TELEMETRY_FRONTEND_ENABLED :66`).
Attach at the six surfaces above; for the server-generated character edit form,
inject in `buildEditFormHtml()` or client-side.

### B — PTY-over-WebSocket terminal (Bun native, behind flag)

`WS /api/v1/terminal`: native `Bun.serve` `websocket:` handler +
`server.upgrade(req)` (NOT Elysia `.ws()` — fails under current `start.ts`
shape). Spawn `Bun.spawn([$EDITOR, file], { terminal: { cols, rows, data } })`
(async only). Message envelope `{type:"resize"|"input",…}` is greenfield;
only the `send(string|Uint8Array)` signature and `Connection.metadata` state bag
(`protocol.unified.ts:17-22`) are reusable from `ws.ts`. Frontend: xterm.js
panel (only new dep, browser-side). Feature-detect
`typeof Bun.Terminal === "function"` and refuse when absent (protects CI 1.2.x
until the floor moves). Kill PTY on disconnect + idle timeout.

### C — Harness sandbox file navigation (read-only tree + open)

`GET /api/v1/harness/runs/:id/files` returns the sandbox tree (chroot via a new
`isWithin` helper; reject `..`, escaping symlinks, absolute paths). Browser
renders tree; clicking a file uses A/B. Expose tree **read-only**; writes happen
in the editor (it owns writes). "Open sandbox folder in $EDITOR" button via B/C.

## Security

- Admin-only route (`requirePermission`), localhost-only default
  (`web.terminal.allowRemote`, default false); validate `Origin` on upgrade.
- Allowlisted spawn: `$EDITOR <file>` only, no shell; log every spawn to
  harness exec-log (`src/harness/exec-log.ts` — file exists, wiring is new).
- Chroot: resolve against sandbox root, reject escapes (new `isWithin` helper).
- Kill on disconnect + idle timeout (e.g. 30 min).

## Sequencing

A → B → C. B needs the CI floor decision (bump to >=1.4.0 or feature-detect —
feature-detect ships regardless). C needs A. MCP `open_in_editor` tool is a
later optional addition, not a prerequisite.

## Acceptance Criteria

- [ ] `web.editor` (default `"vscode"`) + `web.terminal.*` (`enabled` default
  false, `allowRemote` default false) section registered via the 4-point
  config pattern (factory, env-map, json-schema, barrel).
- [ ] "Open in $EDITOR" buttons on the six verified text-edit surfaces,
  using `editorUrl()`; editor scheme delivered via inline-script bootstrap.
- [ ] `WS /api/v1/terminal` upgrades under the real `start.ts` server shape
  (native `Bun.serve` handler), spawns `$EDITOR <file>` in a PTY, relays
  bytes both ways, handles resize, dies on disconnect/idle.
- [ ] Route refuses to start when `typeof Bun.Terminal !== "function"`.
- [x] `GET /api/v1/harness/runs/:id/files` lists the sandbox tree read-only
  with traversal tests (`..`, symlink escape, absolute path all rejected).
- [ ] Every PTY spawn is logged to the harness exec-log.
- [ ] `bun run check` green; no `any`, no new backend dep for the PTY path.

## Research

- Scratchpad: `.tmp/web-editor-support/analysis.md` (variants A–E, threat model,
  minimal sketch, open questions) + verification reports (three scouts,
  2026-10-30; key files archived in session history).
- Reference impls: ttyd, gotty (PTY-over-WS); xterm.js (frontend renderer).

## Linked Tasks

- `TASK-web-editor-open-in-editor-uri-scheme-links-approach-a.md` — approach A (URI-scheme links).
- `TASK-web-editor-pty-terminal-route-approach-b.md` — approach B (PTY route + xterm panel).
- `TASK-web-editor-config-section-plus-bun-floor-web-editor-web-term.md` — config section + Bun floor.
- `TASK-web-editor-harness-sandbox-file-tree-approach-c.md` — approach C (sandbox file tree).
- `TASK-web-editor-pty-spawn-audit-logging-to-harness-exec-log.md` — PTY spawn → exec-log wiring.

git issue: 50112ba
