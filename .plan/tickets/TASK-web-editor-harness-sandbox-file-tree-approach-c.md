<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: harness sandbox file tree (approach C)

**Status:** Done
**Scope:** Browser-side terminal EDITOR support epic (S1 config, S2 URI links, S3 PTY route, S4 sandbox tree)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. GET /api/v1/harness/runs/:id/files read-only tree chrooted to sandbox root via new isWithin helper (reject dotdot, escaping symlinks, absolute paths). Browser tree view, click opens via A/B, plus open-sandbox-in-editor button. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md section C.

**Context:**

Shipped 2026-10-30. `isWithin` (src/utils/is-within.ts) resolves through realpathSync when the path exists, so a symlink inside the root pointing outside fails containment; not-yet-existing paths fall back to lexical resolution. The route maps refusals to 400 (escape) / 404 (no-run, no-sandbox, not-found) / 500 (io); `sandboxRootForRun` additionally requires the sandbox strictly inside `tree/`, so a branch of `..` cannot resolve onto the repo root. The route is registered in `src/routes/harness/index.ts` behind the existing `requirePermission("admin.system")` guard; the response schema lives beside the other harness wire shapes in `admin-harness-schema.ts`. Listing tests run at the `harnessRunFiles` unit level against a real tempdir sandbox because the route resolves the sandbox against the server cwd, which tests must not write to.

**Acceptance Criteria:**

- [x] Implementation complete — `GET /api/v1/harness/runs/:id/files` registered in `src/routes/harness/index.ts` over `src/routes/harness/files.ts` (`sandboxRootForRun`, `listSandboxDir`, `harnessRunFiles`); `isWithin` in `src/utils/is-within.ts`; tree UI in `admin-harness-panel.html` + `admin-harness-files.ts`/`admin-harness.ts`; locale keys in all 10 `src/public/locales/*.json` (pinned by the `i18n - static keys` + `i18n - reconcile` gates).
- [x] Tests passing — `bun test src/utils/is-within.test.ts src/routes/harness/ src/frontend/alpine/admin-harness-rows.test.ts src/frontend/open-in-editor.test.ts`: 50 pass, 0 fail. Traversal AC pinned by `src/routes/harness/files.test.ts` "rejects `..` traversal and absolute paths" + `src/utils/is-within.test.ts` "rejects traversal, siblings, and absolutes outside the root"; symlink-escape pinned by `is-within.test.ts` "rejects a symlink inside the root that escapes it" (real symlink in a temp dir) and `files.test.ts` "lists the sandbox root read-only, dirs first, skipping escapes".
- [x] Documentation updated — CHANGELOG.md Unreleased/Added entry; ticket + epic ACs ticked.

git issue: f63d7d9

**Resolved:** 2026-10-30 registry-driven close: git issue f63d7d9 (registry tip: 2f40f3f9a Konstantin Fedotov Close issue)
