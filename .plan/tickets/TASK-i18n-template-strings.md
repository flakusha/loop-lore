# TASK: i18n Template String Replacement

**Status:** 🟡 In Progress
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

### Text Content (triple-brace)

```html
<h1>{{{t("settings.title")}}}</h1>
<button>{{{t("common.save")}}}</button>
```

### HTML Attributes (x-bind)

Formatter chokes on `{{{t()}}}` inside attributes. Use Alpine x-bind:

```html
<input placeholder="{{{t("key")}}}" aria-label="{{{t("key")}}}">
<!-- Becomes: -->
<input x-bind:placeholder="t('key')" x-bind:aria-label="t('key')">
```

## Completed

| File                                   | Status     | Notes                           |
| -------------------------------------- | ---------- | ------------------------------- |
| `src/views/layout.html`                | ✅ Done    | Already translated              |
| `src/views/login.html`                 | ✅ Done    | Log In, demo mode, signup link  |
| `src/views/register.html`              | ✅ Done    | Sign Up, login link             |
| `src/components/auth-form-fields.html` | ✅ Done    | Username/Password labels        |
| `src/components/chat/chat-header.html` | ✅ Done    | 5 buttons via x-bind            |
| `src/views/settings.html`              | 🟡 Partial | 3 placeholders + 2 aria-labels  |
| `src/views/admin.html`                 | 🟡 Partial | 4 search placeholders           |
| `src/views/chat-list.html`             | ✅ Done    | search placeholder + aria-label |
| `src/views/new-chat.html`              | 🟡 Partial | cancel + create buttons         |

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
