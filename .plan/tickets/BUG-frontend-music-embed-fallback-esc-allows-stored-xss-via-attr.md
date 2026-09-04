# BUG: frontend: music-embed fallback esc() allows stored XSS via attribute breakout and javascript: URLs

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

src/frontend/alpine/chat/music-embed.ts esc() (lines 30-34) uses textContent then getHTML(), which does not escape double quotes; values are interpolated into src= and href= attributes (lines 36, 40). A value containing a double quote breaks out of the attribute. Also no URL scheme validation, so javascript: URLs pass through. The prior XSS fix (14a4f71c) only covered the DOMPurify iframe path. Fix: escape double quote to &quot; and allowlist http(s):/mailto: schemes.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution


Fixed 2026-09-04. Commit: `f3f4f38c` (GPG-signed; branch `fix-xss-music-embed` fast-forward merged into `dev`).

- **`escText`** (exported) — escapes `& < >` for child-text interpolation.
- **`escAttr`** (exported) — `escText` plus `"` → `&quot;` for double-quoted attribute contexts (`src`, `href`, `alt`).
- **`safeUrl`** (exported) — `^(?:https?:\/\/|mailto:)` scheme allowlist applied to every `src=`/`href=` value; everything else rewrites to `#blocked`.
- All three are pure string functions (no DOM), so the `renderMusicEmbed` fallback card interpolation is now: `<img src="${safeUrl(thumbnailUrl)}" alt="${escAttr(title)}">` + `<a href="${safeUrl(serviceUrl)}">${escText(title)} — ${escText(artist)}</a>`.

**Why pure string helpers instead of DOM `textContent`+`getHTML()`**: equivalence (`< > & → &lt; &gt; &amp;`); no DOM dependency at render time; trivially unit-testable in Bun.

**Tests** (`src/frontend/alpine/chat/music-embed.test.ts`, 19 cases):

- `escText`: escapes `& < >`; quotes pass through (use `escAttr` for attributes); null/undefined → empty; documents non-double-escape behavior on `&lt;`.
- `escAttr`: escapes `& < > "`; closes the attribute-breakout vector on `alt=`; null/undefined → empty.
- `safeUrl`: accepts `http:`, `https:`, `mailto:` (case-insensitive); rejects `javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative `//`, empty string, `null`, `undefined`, relative paths; escapes attribute-breaking chars in the URL fragment.

Verification: `bun x tsc --noEmit` clean; `bun test src/frontend/alpine/chat/music-embed.test.ts` 19/19 pass (114ms).
