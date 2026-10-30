<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: open-in-editor URI-scheme links (approach A)

**Status:** Done
**Scope:** Browser-side terminal EDITOR support epic (S1 config, S2 URI links, S3 PTY route, S4 sandbox tree)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. Add editorUrl(path,line,editor) helper emitting vscode:// / zed:// / cursor:// / idea:// links plus Open in $EDITOR buttons at the six verified text-edit surfaces. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md section A.

**Context:**

`src/frontend/open-in-editor.ts` — `editorUrl({ path, line?, editor? })` (vscode/zed/cursor file-scheme shape, `idea://open?file=` query shape, per-segment path encoding, unknown-scheme → vscode fallback) + `enhanceOpenInEditorLinks()` hydrating `a[data-editor-path]` anchors on DOMContentLoaded and htmx after-swap (wired in `alpine-init.ts`), hiding them when the bootstrap is absent. Layout bootstrap seeds `__EDITOR__` (from `web.editor`) and `__EDITOR_FILE_ROOT__` (repo root) beside `__TELEMETRY_FRONTEND_ENABLED` — resolved lazily + cached in `routes/views/layout.ts` because a module-scope `loadConfig()` crashes the template-preflight tool (uninitialized logger). Buttons at the six surfaces: `src/views/blog.html`, `src/partials/characters/create-modal.html`, `src/routes/views/character-edit-form.ts` (server-injected per the epic), `src/components/modals/settings.html` ×2 (custom instructions + template payload), `src/components/chat/chat-settings-modal.html` (per-chat override), each with the surface's repo-relative path + best-effort line anchor, `hidden` until hydration. Label `common.openInEditor` added to en.json and backfilled into all nine locale catalogs via `i18n:fix`.

Scope note: the anchors open the surface's backing repo file (the only file a URI scheme can resolve; approach A is one-way per the epic — content sync is approach B's PTY).

**Acceptance Criteria:**

- [x] Implementation complete — helper + hydration + bootstrap + six surfaces
- [x] Tests passing — `src/frontend/open-in-editor.test.ts` (9 tests: scheme shapes, line handling, encoding, fallback, hydration/hiding) + `src/routes/views/` suite 217 pass / 0 fail; gates `typecheck - backend/bun/frontend`, `lint - eslint`, `format - dprint`, `size - strict`, `changelog - gate`, `i18n - reconcile`, `i18n - static keys`, `frontend - template preflight`, `frontend - innerHTML xss`, `wiring - check` all PASS
- [x] Documentation updated — CHANGELOG [Unreleased]/Added

git issue: 42b9293

**Resolved:** 2026-10-30 registry-driven close: git issue 42b9293 (registry tip: 41c9a60bf Konstantin Fedotov Close issue)
