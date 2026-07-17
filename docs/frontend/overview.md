# Frontend: Overview & Design Principles

## Tech Stack

| Layer        | Technology                | Notes                                                                                                                                           |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML         | Prebuilt static templates | Server replaces `&#123;&#123;&#123;content&#125;&#125;&#125;` placeholder in layout.html                                                        |
| AJAX         | htmx 2.x                  | Partial page updates, form submission, server-driven UI                                                                                         |
| Client state | Alpine.js 3.x             | Modals, toasts, local UI toggles (not data state)                                                                                               |
| Styling      | Hand-authored CSS         | 13 files: theme.css + 10 theme-{variant}.css, app.css, gallery.css. No framework. Supports multiple theme variants with CSS variable switching. |
| Icons        | Unicode / SVG             | No icon library dependency. Inline SVGs where needed.                                                                                           |

## Design Principles

1. **Information density**: show what the user needs, hide the rest. No toolbar
   overflow. Advanced features (swipe, inline edit, token details) appear on
   hover or explicit toggle.

2. **Progressive disclosure**: features are revealed contextually. A new user
   sees just the input and messages. Power-user features (swipe, edit,
   regenerate) appear on hover.

3. **Consistent behavior**: same interaction patterns across pages. Buttons in
   consistent locations. Keyboard shortcuts where they reduce friction.

4. **Performance first**: pages load fast, interactions feel instant. htmx
   handles partial updates; full page reloads are rare. The sidebar is cached —
   only the main content area swaps.

5. **Error resilience**: the UI never shows a blank/white state on error. Failed
   API calls leave existing content intact and surface errors via toasts or
   inline banners.

6. **Consistent search & filter patterns**: every entity list screen uses the
   same interaction model for finding things. Search is always a debounced text
   input. Filters are always removable chips. The UX is identical whether
   browsing characters, worlds, chats, or gallery assets.

## Search & Filter Pattern

All entity list screens (characters, worlds, chats, gallery) follow a consistent
search and filter pattern. This section defines the shared behavior.

### Common Elements

- **Search input:** text field with magnifier icon, debounced (300ms), filters
  by name or label. Clear button (×) when non-empty.
- **Filter chips:** horizontal row of toggleable chips below the search input.
  Active chips have a distinct style (filled background). Click to toggle.
  "Clear all" link when any filter is active.
- **Sort dropdown:** optional, per-screen. Default sort varies by entity.

### Per-Screen Filters

| Screen     | Search by   | Filters                                                              | Sort options                    |
| ---------- | ----------- | -------------------------------------------------------------------- | ------------------------------- |
| Characters | name        | Type (All / Users / Characters), Visibility (All / Private / Public) | Newest, Most Active, Name A-Z   |
| Worlds     | name        | Tags (from world tags), Owner (All / Mine)                           | Newest, Last Activity, Name A-Z |
| Chats      | name        | Type (1x1 / Group), Visibility (Private / Public), World             | Newest, Last Message, Name A-Z  |
| Gallery    | name, label | Media type (All / Images / Audio / Video), Visibility                | Newest, Size, Name A-Z          |

### Empty States

Each filter combination that yields zero results shows:

- "No [entities] match the current filter."
- "Clear filters" link that resets all filters and search

### URL Persistence

Filter state is persisted in the URL query string (e.g.,
`/characters?type=character&visibility=public&search=lyra`). This enables
bookmarking and back-button navigation through filter states.

### API Integration

Filters map to query parameters on the list endpoint:

```
GET /api/characters?type=character&visibility=public&search=lyra&sort=name&order=asc
GET /api/worlds?tags=fantasy&owner=me&search=realms
GET /api/chats?type=group&visibility=public&world_id=world-uuid
GET /api/assets?asset_type=image&visibility=public&search=portrait
```

## Design Token Reference

All design tokens are CSS custom properties defined in `theme-default.css`
(default dark theme). Other themes override these with different color values.
The `theme.css` file provides fallback values for when no theme is loaded.

| Token              | Value                                 | Purpose                                      |
| ------------------ | ------------------------------------- | -------------------------------------------- |
| `--bg-primary`     | `#151820`                             | Page background                              |
| `--bg-secondary`   | `#21242c`                             | Sidebar, card surfaces                       |
| `--bg-tertiary`    | `#30333b`                             | Inputs, elevated surfaces, character bubbles |
| `--text-primary`   | `#fffdf5`                             | Body text                                    |
| `--text-secondary` | `#cfcfcf`                             | Labels, muted text                           |
| `--text-tertiary`  | `#898e93`                             | Placeholder, disabled                        |
| `--text-link`      | `#71a1ff`                             | Links                                        |
| `--accent-primary` | `#f597e8`                             | Buttons, highlights, user bubbles (pink)     |
| `--accent-blue`    | `#0072ff`                             | Info                                         |
| `--accent-green`   | `#29cc6a`                             | Success                                      |
| `--accent-red`     | `#fc5555`                             | Error, danger                                |
| `--accent-yellow`  | `#fbc531`                             | Warning                                      |
| `--border-default` | `#3c3f41`                             | Dividers, subtle borders                     |
| `--font-sans`      | `'Inter', ui-sans-serif, ...`         | Body font                                    |
| `--font-mono`      | `'JetBrains Mono', ui-monospace, ...` | Code font                                    |

Full definitions in `theme.css` including: shadow levels, border radii, spacing
scale, z-index layers, and transitions.

## Theme System

loop-lore supports multiple visual themes via CSS custom properties. Themes are
defined in separate CSS files and switched dynamically via JavaScript.

### Available Themes

| Theme ID      | Name           | Description                                |
| ------------- | -------------- | ------------------------------------------ |
| `default`     | Default (Dark) | Original dark theme                        |
| `light`       | Light          | Light background with dark text            |
| `bright`      | Bright         | High contrast vibrant theme                |
| `colorful`    | Colorful       | Vibrant saturated colors                   |
| `monochrome`  | Monochrome     | Grayscale high-contrast theme              |
| `no-icons`    | No Icons       | Minimal theme with decorative icons hidden |
| `dracula`     | Dracula        | Popular dark theme (dracula/lua)           |
| `nord`        | Nord           | Arctic color palette (arctic-violet)       |
| `github-dark` | GitHub Dark    | GitHub's dark syntax theme                 |
| `material`    | Material       | Material Design 3 inspired                 |

### Theme Files

- `theme.css` — Core resets, global styles, and default design token fallbacks
- `theme-default.css` — Default dark theme design tokens
- `theme-light.css` — Light theme design tokens
- `theme-bright.css` — Bright theme design tokens
- `theme-colorful.css` — Colorful theme design tokens
- `theme-monochrome.css` — Monochrome theme design tokens
- `theme-no-icons.css` — No-icons theme with icon hiding rules
- `theme-dracula.css` — Dracula theme design tokens
- `theme-nord.css` — Nord theme design tokens
- `theme-github-dark.css` — GitHub Dark theme design tokens
- `theme-material.css` — Material theme design tokens

### Theme Switching

Themes are switched by toggling the `disabled` property on the theme stylesheet
link elements. The browser automatically applies the active theme's CSS
variables.

1. User selects theme in Settings
2. JavaScript disables all theme stylesheets
3. JavaScript enables the selected theme stylesheet
4. Theme preference saved to localStorage

### CSS Architecture

No Tailwind. No CSS-in-JS. Thirteen files:

## Icon Strategy

No Font Awesome or icon library. Icons are:

- Unicode characters for simple UI symbols (→ ⚙ ➤ 🖼 ℹ ✗ ✓ ⚠)
- Inline SVGs for any icon that needs precise styling or color
- This keeps the CSS bundle lean and avoids external dependencies

## Error Handling Pattern

All htmx requests targeting content-bearing regions use `hx-target-error` to
shunt error responses to the toast container. This prevents error response
bodies from being rendered visibly into content areas during brief flashes. On
error, existing content stays intact and the user sees a toast notification
instead.

On 401 responses, redirect to `/login`. On 500+, show "Server error" toast with
retry suggestion. On network failure, show "Connection lost" toast.

## Document Index

| File                                                     | Pages covered                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [routing.md](./routing.md)                               | URL structure, navigation patterns, htmx history                                                          |
| [chat/overview.md](./chat/overview.md)                   | Chat types, data model, message tree, chat master, world/location                                         |
| [chat/layout.md](./chat/layout.md)                       | Hamburger sidebar, centered configurable width, left/right panels, responsive                             |
| [chat/messages.md](./chat/messages.md)                   | Markdown render, message bubbles, book-like image layout, detail levels, tooling, swipe, thinking display |
| [chat/generation.md](./chat/generation.md)               | Typing indicator, streaming, generation status, 3-tier error handling, thinking logging                   |
| [chat/archiving.md](./chat/archiving.md)                 | Cascade deletion, restore, purge                                                                          |
| [chat/input.md](./chat/input.md)                         | Text input, media attach, LLM selector, message improvement, image generation                             |
| [chat/memories.md](./chat/memories.md)                   | User memories, character memories, world memories, memory selection, auto-purge                           |
| [chat/commands-and-misc.md](./chat/commands-and-misc.md) | Keyboard shortcuts, states summary, group chat, world background, image pipeline, system messages         |
| [characters.md](./characters.md)                         | Character list grid, character create/edit form                                                           |
| [gallery.md](./gallery.md)                               | Asset gallery grid, preview modal, upload dialog                                                          |
| [settings.md](./settings.md)                             | Settings sections: general, chat, API config, data management                                             |
| [worlds.md](./worlds.md)                                 | World entity: list, detail, create/edit                                                                   |
| [login.md](./login.md)                                   | Login page: auth card, demo mode, error states                                                            |
| [age-gate.md](./age-gate.md)                             | Age verification / compliance: self-declaration flow, admin config, states                                |
| [components.md](./components.md)                         | Shared components: toasts, modals, spinners, skeletons, empty states, chips, drop zones, frontend logger  |
| [data-states.md](./data-states.md)                       | Entity state machines, archiving cascade, storage model, purge rules                                      |
| [internationalization.md](./internationalization.md)     | Multilingual support: UI i18n, LLM generation language, actor language preferences, content translation   |
