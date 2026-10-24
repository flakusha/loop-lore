<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(plugins): make plugin discovery failures visible

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-mechanics-governance

**Summary:**

Sources: stream-b #7. Where: src/plugins/loader.ts:149-150 (missing plugin.ts silent return), :158-161 (invalid manifest warn+return), :193 (error: String(error), no stack), :354-359 (onUnload swallow). Gap: a plugin directory without plugin.ts returns silently, an invalid manifest only warns, load errors drop the stack, and onUnload failures vanish - typos and broken teardowns disappear from boot logs while shutdown stays best-effort. Acceptance: skipped directories/invalid manifests log at warn with names; load errors log with stack/cause; onUnload failures are emitted (shutdown remains best-effort). Priority: low - boot-log observability; no runtime behavior change.

**Context:**

The three silent paths were confirmed in `src/plugins/loader.ts`: a plugin directory without `plugin.ts` returned without a word, an invalid manifest warned without the plugin name and without the directory, and every load error was logged as `String(error)` — which drops the stack — so a typo'd plugin or a broken teardown left no trace in the boot log.

Fix shape: keep the loader's behaviour (a broken plugin never registers) and make the failure visible through the structured logger — warn for a skipped directory and for an invalid manifest, error with the real `Error` (stack preserved) for a load failure. Shutdown stays best-effort: one plugin's `onUnload` failure is now logged and the remaining plugins still unload.

Constraint: no secret value may appear in a log line — the plugin failures carry the plugin name, origin and directory only.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (no user-facing surface changed — this is boot-log visibility)

## Resolution

- `src/plugins/loader.ts:139` — `asError(error)` normalizes a caught value into an `Error`, so the stack survives; the old `String(error)` dropped it.
- `src/plugins/loader.ts:164` — a plugin directory without `plugin.ts` now warns with the plugin name, origin and directory instead of returning silently.
- `src/plugins/loader.ts:178` — an invalid manifest warns with the plugin name, origin and directory.
- `src/plugins/loader.ts:224` — a load failure logs the `Error` itself (stack preserved) plus plugin, origin and directory.
- `src/plugins/loader.ts:323` and `:408` — plugin-state persistence failures and `onUnload` failures are emitted; shutdown remains best-effort (one plugin's teardown failure no longer stops the rest).

Regression test: `src/plugins/loader.discovery-failures.test.ts` — "a plugin directory without plugin.ts is logged, not skipped silently" and "a plugin that throws while loading is logged with its stack" (both fail before the fix: no warn entry was emitted, and the error entry carried no stack), plus "a plugin with an invalid manifest is logged with its name".
