<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: PTY terminal route (approach B)

**Status:** Done
**Scope:** Browser-side terminal EDITOR support epic (S1 config, S2 URI links, S3 PTY route, S4 sandbox tree)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. WS /api/v1/terminal via native Bun.serve websocket handler plus server.upgrade (NOT Elysia .ws, fails under start.ts shape). Bun.spawn with terminal, byte relay, resize envelope, kill on disconnect/idle, xterm.js panel. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md section B.

**Context:**

Implemented in worktree feat-web-editor-support (slice 3). `src/server/terminal-ws.ts` = gateway (native Bun.serve websocket handler + `server.upgrade`, wired into both HTTP/HTTPS listeners in `start.ts` behind the readiness gate); `src/server/terminal-ws-protocol.ts` = pure wire helpers (split for the 250-line gate). Gate chain order: upgrade header 426 → `web.terminal.enabled` 404 → `Bun.Terminal` feature-detect 501 → `authenticate` 401 → `requirePermission("admin.system")` 403 (audit-logged) → loopback IP+Origin 403 unless `web.terminal.allowRemote` → $VISUAL/$EDITOR 501 → `?path` containment via realpath-hardened `src/utils/is-within.ts` 400. Spawn: `Bun.spawn([editor, file], { terminal, cwd: rootDir })`; bytes relay binary frames; input/resize JSON envelopes; kill on disconnect; idle ceilings = Bun socket 960s + app 30min. Frontend: `src/frontend/terminal-panel.ts` Alpine overlay + `terminal-xterm.ts` built as unhashed ESM chunk loaded by runtime URL import (bun builds the main bundle as one non-split IIFE — a literal dynamic import got inlined, hence the assembled-specifier trick). Vendored `@xterm/xterm/css/xterm.css` → `/css/xterm.css` (MIT header intact). `__WEB_TERMINAL_ENABLED__` bootstrap global upgrades approach-A anchor clicks to the PTY.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Evidence:** `bun test src/server/terminal-ws.test.ts src/utils/is-within.test.ts src/frontend/terminal-panel.test.ts` → 26 pass / 0 fail (gate chain: 426/404/501/401/403 non-admin/403 remote+origin/501 no-editor/400 traversal+missing-path/upgrade-data; envelope parser; spawn record; isWithin traversal+symlink-escape+prefix-collision; anchor interception modifiers). `bun test src/routes/views/` → 208 pass (layout bootstrap). Scoped gates all PASS: typecheck backend/bun/frontend, lint eslint, format dprint, size strict, changelog gate, i18n reconcile + static keys, template preflight, innerHTML xss, wiring check, db schema gate (13/13). CHANGELOG `[Unreleased] → Added` bullet added. Frontend build emits unhashed `dist/public/terminal-xterm.js` (333KB) + main alpine-init without xterm inlined.

git issue: 5bf3df5
