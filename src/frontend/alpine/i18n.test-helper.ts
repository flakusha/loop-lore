// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Test helper — load the real en.json catalog into `__localeStrings`.
 *
 * Component code resolves user-facing strings through the global `t()` (from
 * alpine/i18n.ts), which reads `globalThis.__localeStrings`. Unit tests that
 * assert on toast/status messages must install the real catalog first so
 * `t("toasts.networkError")` resolves to "Network error" instead of falling
 * back to the raw key.
 *
 * Import this module as the FIRST import in the test file — module-level
 * `t()` calls (e.g. notification TYPE_LABELS) run at import time.
 */
import { readFileSync, } from "node:fs";
import { join, } from "node:path";

const enJson = readFileSync(
  join(import.meta.dir, "../../public/locales/en.json",),
  "utf8",
);

(globalThis as { __localeStrings?: Record<string, unknown> }).__localeStrings = JSON.parse(enJson,) as Record<
  string,
  unknown
>;
