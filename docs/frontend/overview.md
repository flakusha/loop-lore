# Frontend: Overview & Design Principles

## Tech Stack

| Layer        | Technology                | Notes                                                                                    |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------- |
| HTML         | Prebuilt static templates | Server replaces `&#123;&#123;&#123;content&#125;&#125;&#125;` placeholder in layout.html |
| AJAX         | htmx 2.x                  | Partial page updates, form submission, server-driven UI                                  |
| Client state | Alpine.js 3.x             | Modals, toasts, local UI toggles (not data state)                                        |
| Styling      | Hand-authored CSS         | 3 files: theme.css, app.css, gallery.css. ~26KB total. No framework.                     |
| Icons        | Unicode / SVG             | No icon library dependency. Inline SVGs where needed.                                    |

## Design Principles

1. **Information density**: show what the user needs, hide the rest. No toolbar overflow. Advanced features (swipe, inline edit, token details) appear on hover or explicit toggle.

2. **Progressive disclosure**: features are revealed contextually. A new user sees just the input and messages. Power-user features (swipe, edit, regenerate) appear on hover.

3. **Consistent behavior**: same interaction patterns across pages. Buttons in consistent locations. Keyboard shortcuts where they reduce friction.

4. **Performance first**: pages load fast, interactions feel instant. htmx handles partial updates; full page reloads are rare. The sidebar is cached — only the main content area swaps.

5. **Error resilience**: the UI never shows a blank/white state on error. Failed API calls leave existing content intact and surface errors via toasts or inline banners.

## Design Token Reference

All design tokens are CSS custom properties defined in `/css/theme.css`:

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

Full definitions in `theme.css` including: shadow levels, border radii, spacing scale, z-index layers, and transitions.

## CSS Architecture

No Tailwind. No CSS-in-JS. Three files:

1. **theme.css** — CSS custom properties (design tokens), global resets, scrollbar, selection colors
2. **app.css** — Layout system, component classes (`.btn`, `.modal`, `.sidebar`, `.message`, `.input-area`, `.toast`, `.form-input`, `.empty-state`, `.spinner`, `.tag`)
3. **gallery.css** — Asset gallery components (`.gallery`, `.gallery-nav`, `.asset-grid`, `.drop-zone`)

## Icon Strategy

No Font Awesome or icon library. Icons are:

- Unicode characters for simple UI symbols (→ ⚙ ➤ 🖼 ℹ ✗ ✓ ⚠)
- Inline SVGs for any icon that needs precise styling or color
- This keeps the CSS bundle under 30KB and avoids external dependencies

## Error Handling Pattern

All htmx requests targeting content-bearing regions use `hx-target-error` to shunt error responses to the toast container. This prevents error response bodies from being rendered visibly into content areas during brief flashes. On error, existing content stays intact and the user sees a toast notification instead.

On 401 responses, redirect to `/login`. On 500+, show "Server error" toast with retry suggestion. On network failure, show "Connection lost" toast.

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
| [components.md](./components.md)                         | Shared components: toasts, modals, spinners, skeletons, empty states, chips, drop zones                   |
| [data-states.md](./data-states.md)                       | Entity state machines, archiving cascade, storage model, purge rules                                      |
| [internationalization.md](./internationalization.md)     | Multilingual support: UI i18n, LLM generation language, actor language preferences, content translation   |
