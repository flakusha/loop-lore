<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Frontend Component Architecture

> Promoted 2026-09-18 from 1.4KB stub. Authoritative source is `src/` and AGENTS.md.

## HTMX vs Alpine.js Responsibility Boundaries

### HTMX Responsibilities (`src/frontend/alpine/htmx.ts`)

- DOM swapping and transitions (maintains `#app-root` and OOB swaps)
- Event handlers for request interception (auth, CSRF)
- Lifecycle: `AfterSwap` → `Alpine.initTree()` on swapped content
- OOB element management (header swaps, sidebar swaps)

### Alpine.js Responsibilities (`src/frontend/alpine/*.ts`)

- Component state management (`chatState`, `charactersState`, etc.)
- Re-render when state changes (Alpine reactivity)
- Component lifecycle: `init()` on mount, `destroy()` on unmount
- UI interactions: click handlers, form submissions, modals

### Layout Persistence Pattern

- Persistent elements (sidebar, toast container) live in `src/views/layout.html`
- Page-specific elements (header, main content) are swapped into `#app-root`
- Header uses OOB swap to update `#header-slot` without losing Alpine state
- Alpine stores (`$store.ui`, `$store.sidebar`) maintain cross-page state

## Shared Components (`src/components/`)

The actual `src/components/` layout is **flat** at the top level with **two
typed subdirectories** (`chat/`, `character/`). There is no
`components/sidebar/`, `components/header/`, `components/galleries/`, or
`components/info-bubble.html` — those paths in earlier drafts were aspirational.

### Top-level components (`src/components/*.html`)

| File                       | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `auth-form-fields.html`    | Email/password/confirm fields for auth pages       |
| `empty-state.html`         | Empty list/grid state with icon + message + CTA   |
| `filter-bar.html`          | Filter controls above list/grid views             |
| `filter-chips.html`        | Chip-style filter toggles (characters, worlds)    |
| `header.html`              | Page header (also referenced by OOB swap)         |
| `key-management.html`      | Encryption key management UI (encryption.md)      |
| `load-more.html`           | "Load more" pagination trigger                    |
| `loading-state.html`       | Skeleton/shimmer placeholder during fetches       |

### Chat components (`src/components/chat/`)

32 chat-specific partials grouped by purpose:

- **Layout / chrome:** `chat-header.html`, `chat-list-panel.html`,
  `input-area.html`, `message-list.html`, `mobile-composer.html`
- **Side panels:** `gallery-sidebar.html`, `memory-panel.html`,
  `mood-panel.html`, `background-panel.html`, `emotion-avatars-panel.html`,
  `location-panel.html`, `media-preview-modal.html`, `music-embed.html`,
  `pins-panel.html`, `sections-panel.html`, `story-view.html`
- **Modals:** `chat-settings-modal.html`, `rename-chat-modal.html`,
  `media-preview-modal.html`, `archive-confirm.html`
- **GM panels:** `gm-panel.html`, `gm-guidance-panel.html`,
  `_gm-guidance-body.html`, `gm-quests-panel.html`, `gm-story-panel.html`
- **Wizard / assistant / participant:** `wizard-panel.html`,
  `assistant-panel.html`, `character-info-panel.html`,
  `participant-mgmt.html`
- **Search / nav:** `message-search-bar.html`, `keynav-help.html`

### Character components (`src/components/character/`)

- `emotion-avatars-panel.html`
- `entities-panel.html`
- `licensing-panel.html`
- `systems-panel.html`
- `traits-panel.html`

### Modals (`src/components/modals/`)

- `settings.html` — Settings modal partial (consumed by `/settings`)

### Export (`src/components/export/`)

- `export-progress-panel.html` — progress UI for export operations

### Cross-page partials (`src/views/partials/`)

Shared partials that are NOT in `src/components/` because they are
domain-specific and loaded via `views/`:

- `character-growth-editor.html`
- `character-journey.html`

## Adding a New Component

1. **Top-level UI primitive** (filter bar, empty state, header): add to
   `src/components/*.html`. Reference via `<partial src="components/foo.html">`.
2. **Chat-specific:** add to `src/components/chat/*.html`. Wire into
   `src/views/chat.html` via partial include.
3. **Character-specific:** add to `src/components/character/*.html`.
4. **Page partial** (only loaded by one view): add to
   `src/views/partials/*.html` if it is an inline editor; otherwise prefer
   `src/components/`.

## See Also

- `docs/frontend/overview.md` — high-level frontend architecture
- `docs/frontend/components.md` — CSS / styling contracts
- `docs/frontend/chat/layout.md` — chat component layout
- `src/views/layout.html` — root layout (sidebar, header slot, toast container)
- `src/frontend/alpine/` — Alpine stores and components
