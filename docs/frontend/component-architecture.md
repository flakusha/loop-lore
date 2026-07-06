# Frontend Component Architecture

## HTMX vs Alpine.js Responsibility Boundaries

### HTMX Responsibilities (htmx.ts)

- DOM swapping and transitions (maintains `#app-root` and OOB swaps)
- Event handlers for request interception (auth, CSRF)
- Lifecycle: AfterSwap → Alpine.initTree() on swapped content
- OOB element management (header swaps, sidebar swaps)

### Alpine.js Responsibilities (alpine/*.ts)

- Component state management (chatState, charactersState, etc.)
- Re-render when state changes (Alpine reactivity)
- Component lifecycle: init() on mount, destroy() on unmount
- UI interactions: click handlers, form submissions, modals

### Layout Persistence Pattern

- Persistent elements (sidebar, toast container) live in `layout.html`
- Page-specific elements (header, main content) are swapped into `#app-root`
- Header uses OOB swap to update `#header-slot` without losing Alpine state
- Alpine stores (`$store.ui`, `$store.sidebar`) maintain cross-page state

### Component Lifecycle Integration

```html
<!-- Each page must include destroy handler -->
<section
  x-data="chatState()"
  @htmx:before-swap.window="destroy()"
  hx-get="/views/partial"
  hx-trigger="load"
></section>
```

### Shared Components

- `components/sidebar/sidebar.html` - Persistent sidebar (OOB swap)
- `components/header/header.html` - Page header (OOB swap)
- `components/modals/` - Reusable modal components
- `components/galleries/` - Asset gallery components
