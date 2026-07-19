// ── i18n infrastructure ──────────────────────────────────

globalThis.__localeStrings = {};

globalThis.__ = function(key: string, fallback?: string): string {
  return __localeStrings[key] || fallback || key;
};
