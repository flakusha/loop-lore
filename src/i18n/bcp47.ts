// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pragmatic BCP-47 langtag well-formedness + case normalization.
 *
 * Translation locales are free-form (models speak more than the 10 UI
 * registry languages), so translation-target boundaries validate
 * WELL-FORMEDNESS here — the 10-entry `LOCALE_REGISTRY`/`isLocale`
 * (locale-registry.ts) remains authoritative ONLY for UI-locale concerns
 * (settings switcher, middleware). Normalization canonicalizes tags
 * (language lowercase, script Titlecase, region UPPERCASE, variants
 * lowercase) so storage and lookup agree and upsert idempotency survives
 * `en-us` vs `en-US`.
 *
 * Accepted shape: `language[-Script][-REGION][-variant*]` where language is
 * 2-3 letters, script 4 letters, region 2 letters or 3 digits, and each
 * variant is 5-8 alphanumerics or 4 starting with a digit. This is
 * deliberately NOT a full RFC 5646 parser (no grandfathered/irregular
 * tags, no private-use extensions) — it is a well-formedness gate.
 */

const LANGTAG_RE =
  /^([a-zA-Z]{2,3})(?:-([a-zA-Z]{4}))?(?:-([a-zA-Z]{2}|[0-9]{3}))?((?:-[a-zA-Z0-9]{5,8}|-[0-9][a-zA-Z0-9]{3})*)$/;

/**
 * Canonicalize a BCP-47 tag, or return null when it is not well-formed.
 * @param tag - raw locale tag (e.g. `"en-us"`, `"ZH-hans-cn"`)
 * @returns {string | null} canonical form (`"en-US"`, `"zh-Hans-CN"`), null on malformed input
 */
export function normalizeBcp47Tag(tag: string,): string | null {
  const trimmed = tag.trim();
  if (!trimmed) { return null; }

  const match = LANGTAG_RE.exec(trimmed,);
  if (!match) { return null; }

  const [, language, script, region, variants = "",] = match;
  let canonical = language!.toLowerCase();
  if (script) {
    canonical += `-${script.charAt(0,).toUpperCase()}${script.slice(1,).toLowerCase()}`;
  }

  if (region) { canonical += `-${region.toUpperCase()}`; }
  if (variants) { canonical += variants.toLowerCase(); }
  return canonical;
}

/**
 * Whether a tag is a well-formed (pragmatic) BCP-47 langtag.
 * @param tag - candidate string
 * @returns {boolean}
 */
export function isWellFormedBcp47(tag: string,): boolean {
  return normalizeBcp47Tag(tag,) !== null;
}
