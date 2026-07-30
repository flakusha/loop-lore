# TASK: i18n Template String Replacement

**Status:** ⬜ Not Started
**Priority:** High
**Epic:** epic-i18n (Phase 3)

## Summary

Replace hardcoded English strings in HTML templates with `{{{t("key")}}}` bindings. Infrastructure is already in place in `views.ts`.

## Infrastructure Ready

- `wrapWithLayout()` accepts `t` parameter
- Regex replaces `{{{t("key")}}}` with translated string
- All view functions pass `t` through

## Files to Update (Priority Order)

| File                        | Hardcoded Strings | Notes                           |
| --------------------------- | ----------------- | ------------------------------- |
| `src/views/layout.html`     | ~12               | Base layout - affects all pages |
| `src/views/settings.html`   | ~46               | Most strings                    |
| `src/views/admin.html`      | ~147              | Largest count                   |
| `src/views/new-chat.html`   | ~18               |                                 |
| `src/views/world-edit.html` | ~19               |                                 |
| `src/views/quests.html`     | ~16               |                                 |
| `src/views/chat-list.html`  | ~9                |                                 |
| `src/views/personas.html`   | ~10               |                                 |
| `src/views/login.html`      | ~1                |                                 |
| `src/views/register.html`   | ~1                |                                 |

## Pattern

Before:

```html
<h1>Settings</h1>
<button>Save</button>
```

After:

```html
<h1>{{{t("settings.title")}}}</h1>
<button>{{{t("common.save")}}}</button>
```

## Key Mapping

| Namespace         | Use Case                                       |
| ----------------- | ---------------------------------------------- |
| `common.*`        | Generic labels (save, cancel, delete, confirm) |
| `settings.*`      | Settings page                                  |
| `admin.*`         | Admin panel                                    |
| `chat.*`          | Chat UI                                        |
| `navigation.*`    | Nav bar, sidebar                               |
| `accessibility.*` | ARIA labels                                    |

## Acceptance Criteria

- [ ] All HTML templates use `{{{t("key")}}}` for user-facing strings
- [ ] No hardcoded English strings remain in templates
- [ ] New keys added to `en.json` for any missing translations
- [ ] `bun run check` passes
- [ ] Pages render identically with `en` locale

## Dependencies

- Phase 3 infrastructure (completed) — `views.ts` supports `{{{t()}}}`
