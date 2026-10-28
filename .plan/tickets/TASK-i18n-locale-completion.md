<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: i18n Locale Completion (Phase 1)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** [2026-10-28 triage reopen] NOT-FIXED — the ticket closed on *missing keys* only. Every non-English catalog now carries the full `en.json` key set (no missing keys), but a majority of the values are still byte-identical English and no gate measures that. Measured 2026-10-28 on dev: 54.2 %–57.0 % of each non-English catalog's leaf keys are byte-identical to `en.json` (per-locale figures are recomputed by the i18n gate; `scripts/i18n-reconcile.ts:28,40` reports only `missing` / `extra` / `type_mismatch`, so the ratio is invisible to CI). The previous acceptance criteria carried stale captured counts (they predate the current catalog size) and therefore passed while the defect was live — the criteria below are now stated as a ratio threshold the gate enforces. Translation backlog remains (9 locales × the untranslated leaf set).
**Priority:** High
**Effort:** Medium
**Epic:** epic-i18n

## Summary

Complete non-English locale files. All 9 non-English locales now carry the complete `en.json` key set, but a large share of their values are still the English source text (untranslated ratio measured per locale by the i18n gate; see Acceptance Criteria). The remaining work is translation work plus the gate change that measures it — no product source changes beyond the i18n gate.

## Scope

### Sections still carrying English values

Every section below still contains untranslated values in at least one non-English catalog; the exact per-locale set is recomputed by the i18n gate (do not hard-code counts here):

| Section         | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `common`        | Generic labels (save, cancel, delete, confirm, loading, etc.) |
| `auth`          | Login/register messages                                       |
| `chat`          | Chat UI labels, message actions                               |
| `settings`      | Settings page labels, tooltips, section headers               |
| `admin`         | Admin panel labels                                            |
| `errors`        | Error messages                                                |
| `characters`    | Character management labels                                   |
| `worlds`        | World management labels                                       |
| `gallery`       | Gallery/upload labels                                         |
| `navigation`    | Nav bar labels, sidebar                                       |
| `modals`        | Modal dialog labels                                           |
| `accessibility` | ARIA labels, screen reader text                               |

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

- [ ] The i18n gate reports an **untranslated ratio** per non-English locale: the share of that locale's leaf keys whose value is byte-identical to the `en.json` value at the same key path. The ratio is computed at gate time from the catalogs on disk — no captured key counts are hard-coded here.
- [ ] The gate **fails** when any non-English locale's untranslated ratio exceeds the threshold recorded in the gate (target: at most 10 % untranslated per locale), so the English backlog cannot silently regrow.
- [ ] The untranslated leaf set of every non-English locale is translated down to that threshold.
- [ ] All 9 non-English locales carry the complete `en.json` key hierarchy (no missing keys; no extra keys; no type mismatches).
- [ ] JSON is valid (no syntax errors).
- [ ] Existing translations preserved (not overwritten).
- [ ] `bun run check` passes.

## Notes

- Arabic translations should consider RTL display context
- Technical terms (API, URL, token, etc.) can stay in English
- Placeholder syntax `{param}` must be preserved in translations
