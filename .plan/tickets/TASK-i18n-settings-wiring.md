<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: i18n Settings Wiring (Phase 5)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-i18n

## Summary

Wire the settings locale switcher to actually re-render the UI. The backend (`PATCH /api/i18n/locale`) already saves the preference — frontend needs to consume it.

## Scope

### Current State

- `settings.html` has a locale selector dropdown
- `PATCH /api/i18n/locale` saves preference to user settings
- Frontend does NOT re-render with new translations after save

### What Needs to Happen

1. **On locale save**:
   - Update `<body data-locale="...">` attribute
   - Update `<body data-catalog="...">` with new locale's catalog
   - Alpine `$t` bindings auto-update (if Phase 4 is complete)

2. **On page load**:
   - Read locale from user settings (already done via middleware)
   - Inject correct locale catalog into template context

3. **Fallback**:
   - If Phase 4 ($t) is not complete, do a full page reload after locale save
   - If Phase 4 is complete, update in-place without reload

### Files to Modify

| File                              | Action | Purpose                           |
| --------------------------------- | ------ | --------------------------------- |
| `src/views/settings.html`         | Modify | Update locale save handler        |
| `src/frontend/alpine/settings.ts` | Modify | Add locale save + re-render logic |

### Pattern

```ts
// In settings Alpine component
async saveLocale(locale) {
  await fetch('/api/i18n/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale })
  });
  
  // Update client-side state
  document.body.dataset.locale = locale;
  // Fetch new catalog and update
  const catalog = await fetch(`/locales/${locale}.json`).then(r => r.json());
  document.body.dataset.catalog = JSON.stringify(catalog);
  
  // Alpine re-renders $t bindings automatically
}
```

## Approach

1. Update settings save handler to call `PATCH /api/i18n/locale`
2. After save, update `<body>` attributes with new locale/catalog
3. If Phase 4 not complete, add `location.reload()` as fallback
4. Test: switch locale → UI updates without errors
5. Verify with `bun run check`

## Acceptance Criteria

- [ ] Locale switcher saves preference via API
- [ ] UI re-renders with new translations after save
- [ ] No page reload required (or reload as fallback if Phase 4 pending)
- [ ] Locale persists across page loads
- [ ] `bun run check` passes

## Dependencies

- Phase 4 (Alpine.js client) — enables in-place re-render without reload
- Phase 3 (template adoption) — templates should use `{{ t() }}` for server-rendered content
