# TASK: i18n Locale Completion (Phase 1)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-i18n

## Summary

Complete non-English locale files. All 9 non-English locales are missing 163 keys each (71/234 filled). This is pure JSON translation work — no code changes.

## Scope

### Missing Sections (per locale)

| Section         | Keys Missing | Description                                                   |
| --------------- | ------------ | ------------------------------------------------------------- |
| `common`        | 15           | Generic labels (save, cancel, delete, confirm, loading, etc.) |
| `auth`          | 4            | Login/register messages                                       |
| `chat`          | 16           | Chat UI labels, message actions                               |
| `settings`      | 44           | Settings page labels, tooltips, section headers               |
| `admin`         | 11           | Admin panel labels                                            |
| `errors`        | 7            | Error messages                                                |
| `characters`    | 16           | Character management labels                                   |
| `worlds`        | 10           | World management labels                                       |
| `gallery`       | 16           | Gallery/upload labels                                         |
| `navigation`    | 10           | Nav bar labels, sidebar                                       |
| `modals`        | 9            | Modal dialog labels                                           |
| `accessibility` | 5            | ARIA labels, screen reader text                               |

### Locales to Complete

- `ar.json` (Arabic — also needs RTL direction consideration)
- `de.json` (German)
- `es.json` (Spanish)
- `fr.json` (French)
- `ja.json` (Japanese)
- `ko.json` (Korean)
- `pt.json` (Portuguese)
- `ru.json` (Russian)
- `zh.json` (Chinese Simplified)

## Approach

1. Read `en.json` as source of truth
2. For each locale, fill missing keys with accurate translations
3. Preserve existing translations (don't overwrite the 71 keys already filled)
4. Validate JSON structure matches `en.json` key hierarchy
5. Run `bun run check` to verify no regressions

## Acceptance Criteria

- [ ] All 9 non-English locales have 234 keys matching `en.json` structure
- [ ] JSON is valid (no syntax errors)
- [ ] Key hierarchy matches `en.json` exactly
- [ ] Existing translations preserved (not overwritten)
- [ ] `bun run check` passes

## Notes

- Arabic translations should consider RTL display context
- Technical terms (API, URL, token, etc.) can stay in English
- Placeholder syntax `{param}` must be preserved in translations
