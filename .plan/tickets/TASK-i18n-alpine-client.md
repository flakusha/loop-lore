# TASK: i18n Alpine.js Client (Phase 4)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-i18n

## Summary

Add Alpine.js `$t` magic property for client-side reactive translations. Enables dynamic content to update when locale changes without page reload.

## Scope

### Implementation

1. **Inject locale data into HTML**:
   - Add `data-locale="en"` attribute to `<body>` in `layout.html`
   - Inject full locale catalog as JSON in a `<script>` tag or `data-catalog` attribute

2. **Create Alpine magic property**:
   - Register `$t` magic property in `src/frontend/alpine/`
   - Reads locale from `<body data-locale>`
   - Resolves key from catalog: `$t("nav.chats")` → `"Chats"`
   - Supports interpolation: `$t("chat.swipe", { current: 2, total: 4 })` → `"Swipe (2/4)"`

3. **Reactivity**:
   - When locale changes (via settings), update `<body data-locale>` and catalog
   - Alpine re-renders all `$t` bindings automatically

### Files to Create/Modify

| File                          | Action | Purpose                                     |
| ----------------------------- | ------ | ------------------------------------------- |
| `src/frontend/alpine/i18n.ts` | Create | `$t` magic property registration            |
| `src/views/layout.html`       | Modify | Add `data-locale` and catalog injection     |
| `src/elysia-app.ts`           | Modify | Inject locale catalog into template context |

### Pattern

```html
<body data-locale="{{ locale }}" data-catalog="{{ catalogJson }}">
```

```ts
// Alpine magic property
Alpine.magic("$t", (el,) => {
  const locale = document.body.dataset.locale;
  const catalog = JSON.parse(document.body.dataset.catalog,);
  return (key, params,) => {
    let value = key.split(".",).reduce((obj, k,) => obj?.[k], catalog,);
    if (params) {
      Object.entries(params,).forEach(([k, v,],) => {
        value = value.replace(`{${k}}`, v,);
      },);
    }
    return value || key;
  };
},);
```

## Approach

1. Create `src/frontend/alpine/i18n.ts` with `$t` magic property
2. Update `layout.html` to inject locale + catalog
3. Update `elysia-app.ts` to pass catalog to template context
4. Test with Alpine components that use `$t`
5. Verify locale switching updates client-side text

## Acceptance Criteria

- [ ] `$t` magic property available in all Alpine components
- [ ] `$t("key")` resolves to translated string
- [ ] `$t("key", { param: value })` supports interpolation
- [ ] Locale change updates all `$t` bindings without page reload
- [ ] `bun run check` passes

## Dependencies

- Phase 3 (template adoption) — templates should already use `{{ t() }}` server-side
- Phase 5 (settings wiring) — locale switcher triggers the client-side update
