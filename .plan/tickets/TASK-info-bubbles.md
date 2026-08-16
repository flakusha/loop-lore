<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Info Bubbles Implementation

**Epic:** Immersion & Presentation (EPIC-048)
**Priority:** Medium
**Effort:** Low
**Status:** Not Started
**Source:** User request — info bubbles for `(?)` signs in menus, i18n intended

## Summary

Implement a reusable info bubble (tooltip/popover) component that displays
additional contextual information when a user clicks or hovers over a `(?)`
help icon. Info bubbles appear throughout the UI — particularly in heavy
configuration menus (Settings, World edit, Character edit, Admin) — to
explain what each field does without cluttering the interface.

## Rationale

- **Heavy config menus** (Settings, World edit, Character edit, Admin) have
  many toggles, selects, and inputs whose purpose is not immediately obvious
  from the label alone.
- Users can get additional information by **clicking or hovering** over `(?)`
  signs placed next to field labels.
- **i18n support is intended** — bubble text must be translatable via the
  existing `t()` function and message catalog system (Layer 1: Application
  Interface, per `docs/frontend/internationalization.md`).
- Reduces cognitive load: keeps UI clean while providing on-demand help.

## Design

### Component: `<info-bubble>`

A lightweight Alpine.js component that renders a `(?)` icon inline with a
label. On hover (desktop) or click (touch), a popover appears with the
help text.

**Trigger modes:**

- `hover` — popover appears on mouseenter, disappears on mouseleave
- `click` — popover toggles on click (for touch devices and keyboard)
- `auto` — hover on desktop, click on touch (default)

**Props:**

- `key` — i18n message key (e.g. `"settings.theme.help"`)
- `placement` — `"top" | "right" | "bottom" | "left"` (default: `"top"`)
- `mode` — `"hover" | "click" | "auto"` (default: `"auto"`)
- `icon` — optional custom icon (default: `(?)` styled as a subtle help icon)

**Rendering:**

- Uses `t(key)` to resolve the help text from the message catalog
- Popover is positioned with a small arrow pointing to the trigger
- Dismisses on Escape, click-away, or mouseleave (for hover mode)
- Keyboard accessible: focusable trigger, Escape to dismiss

### i18n Integration

Info bubble text is part of **Layer 1: Application Interface** (static i18n).
All help text keys follow the pattern:

```
<scope>.<field>.help
```

Examples:

```jsonc
{
  "settings.theme.help": "Choose a color scheme. Changes apply immediately.",
  "settings.font_size.help": "Adjust the base font size for all UI text.",
  "settings.ui_density.help": "Compact reduces spacing; Spacious increases it.",
  "settings.generation_language.help": "Controls what language the AI responds in.",
  "character.personality.help": "Core behavioral traits that shape responses.",
  "world.location.help": "A named place within the world with its own rules."
}
```

### Usage in Templates

```html
<!-- In settings.html -->
<label>
  Theme
  <info-bubble key="settings.theme.help"></info-bubble>
</label>

<!-- In character-editor.html -->
<label>
  Personality
  <info-bubble key="character.personality.help" placement="right"></info-bubble>
</label>
```

### CSS Variables

```css
--info-bubble-icon: #888;
--info-bubble-icon-hover: var(--accent-primary);
--info-bubble-bg: var(--bg-popover, #2a2d33);
--info-bubble-text: var(--text-secondary);
--info-bubble-border: var(--border-default);
--info-bubble-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
```

## Tasks

- [ ] Design `<info-bubble>` Alpine.js component (hover/click/auto modes)
- [ ] Implement popover positioning (placement: top/right/bottom/left)
- [ ] Wire i18n `t()` function for help text resolution
- [ ] Add CSS styles + CSS variables for theming
- [ ] Ensure keyboard accessibility (focus, Escape, ARIA)
- [ ] Add info bubbles to Settings page (General, Chat, API, Data sections)
- [ ] Add info bubbles to Character edit form
- [ ] Add info bubbles to World edit form
- [ ] Add info bubbles to Admin config pages
- [ ] Add i18n message keys for all help text
- [ ] Write unit tests for the component
- [ ] Write E2E tests for hover/click/escape behavior

## Files

- `src/frontend/alpine/info-bubble.ts` — Alpine.js component (new)
- `src/frontend/components/info-bubble.html` — HTML template (new)
- `src/public/css/components/info-bubble.css` — Component styles (new)
- `src/public/locales/en.json` — Help text message keys (extend)
- `src/views/settings.html` — Add info bubbles to settings fields
- `src/views/character-editor.html` — Add info bubbles to character fields
- `src/views/world-editor.html` — Add info bubbles to world fields
- `src/views/admin/` — Add info bubbles to admin config
- `src/frontend/alpine/info-bubble.test.ts` — Unit tests (new)

## Related

- Epic 15 (i18n & Accessibility) — i18n infrastructure, `t()` function, locale files
- Epic 13 (Frontend Responsive & UX) — completed, established component patterns
- `docs/frontend/components.md` — shared component catalog (add info bubble section)
- `docs/frontend/settings.md` — settings page spec (info bubble placement)
- `docs/frontend/internationalization.md` — i18n Layer 1 (Application Interface)
- `TASK-chat-context-feature-permissions.md` — uses `fallback_tooltip` pattern (similar concept)
