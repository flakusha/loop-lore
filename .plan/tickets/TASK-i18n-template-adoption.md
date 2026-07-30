# TASK: i18n Template Adoption (Phase 3)

**Status:** ✅ Complete
**Priority:** High
**Effort:** Large
**Epic:** epic-i18n

## Summary

Replace hardcoded English strings in HTML templates with `{{{t()}}}` bindings. 39/44 templates converted (5 remaining are data-driven with no hardcoded text). 36 new keys added to en.json (818 total).

## Scope

### Views to Update (Priority Order)

| View              | Hardcoded Strings | Priority             |
| ----------------- | ----------------- | -------------------- |
| `layout.html`     | ~8                | High (base layout)   |
| `settings.html`   | ~42               | High (most strings)  |
| `admin.html`      | ~133              | High (largest count) |
| `new-chat.html`   | ~16               | Medium               |
| `world-edit.html` | ~18               | Medium               |
| `quests.html`     | ~15               | Medium               |
| `chat-list.html`  | ~9                | Medium               |
| `personas.html`   | ~8                | Medium               |
| Others            | ~51               | Low                  |

### Pattern

Before:

```html
<h1>Settings</h1>
<button>Save</button>
```

After:

```html
<h1>{{{ t("settings.title") }}}</h1>
<button>{{{ t("common.save") }}}</button>
```

Note: Triple braces `{{{ }}}` for unescaped HTML in Elysia templates.

### Key Mapping

UI strings map to section-specific keys:

- `common.*` — Generic labels (save, cancel, delete, confirm)
- `settings.*` — Settings page
- `admin.*` — Admin panel
- `chat.*` — Chat UI
- `characters.*` — Character management
- `worlds.*` — World management
- `gallery.*` — Gallery/upload
- `navigation.*` — Nav bar, sidebar
- `modals.*` — Modal dialogs
- `accessibility.*` — ARIA labels

## Approach

1. Start with `layout.html` (base — affects all pages)
2. Update `settings.html` (most strings, good test case)
3. Update `admin.html` (largest count)
4. Work through remaining views
5. Add new keys to `en.json` for any strings not yet in the catalog
6. Verify with `bun run check`

## Acceptance Criteria

- [ ] All HTML templates use `{{ t() }}` for user-facing strings
- [ ] No hardcoded English strings remain in templates
- [ ] New keys added to `en.json` for any missing translations
- [ ] `bun run check` passes
- [ ] Visual regression: pages render identically with `en` locale

## Dependencies

- Phase 1 (locale completion) — should be done first for full key coverage
- Phase 2 (route adoption) — independent, can run in parallel
