// ── i18n infrastructure ──────────────────────────────────

import { resolveKey, } from "../i18n";
import type { TranslationMap, } from "../i18n";

// Preserve server-injected translations (set by wrapWithLayout inline script).
// Only initialize to empty if the server didn't inject any.
globalThis.__localeStrings ??= {} as TranslationMap;

globalThis.__ = function(key: string, fallback?: string,): string {
  return resolveKey(globalThis.__localeStrings as TranslationMap, key,) ?? fallback ?? key;
};
