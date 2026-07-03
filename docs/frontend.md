# Frontend Architecture

## Stack

| Layer   | Technology                  | Purpose                                                   |
| ------- | --------------------------- | --------------------------------------------------------- |
| HTML    | Prebuilt templates          | Static pages delivered fast                               |
| AJAX    | htmx                        | Partial page updates, form submission, server-driven UI   |
| State   | Alpine.js                   | Client-side interactivity, modals, toasts, local UI state |
| Styling | Minimal CSS (utility-first) | Lightweight, no framework lock-in                         |

## Prebuilt & Pre-compressed HTML

All HTML pages are pre-rendered at build time (or committed as static files). The server does NOT generate HTML on the fly — it serves pre-existing files.

### Build Pipeline

```
Source templates (src/views/*.html)
  → (optional: template engine processing)
  → gzip + brotli compression
  → dist/public/  (compressed + uncompressed copies)
```

### Serving Strategy

- Bun checks for `.br` or `.gz` variant first, sets `Content-Encoding`
- Falls back to uncompressed if client doesn't accept encoding
- `Cache-Control: public, immutable` for assets with content-hash filenames
- `ETag` / `Last-Modified` for HTML pages

### Dev Mode

- In development, source HTML served directly from `src/views/` (no build step needed)
- Hot-reload via Bun's `--watch` flag (server restarts on file change)

## htmx Integration

htmx drives all dynamic UI. Standard patterns:

### Form Submissions

```html
<form hx-post="/api/login" hx-target="#main" hx-swap="innerHTML">
  <input name="username" type="text" />
  <input name="password" type="password" />
  <button type="submit">Login</button>
</form>
```

### Lazy Loading

```html
<div hx-get="/api/chat/123/messages" hx-trigger="load" hx-swap="innerHTML">Loading messages...</div>
```

### Polling & Events

- `hx-trigger="every 5s"` for message polling (or WebSocket later)
- `hx-trigger="click"` with `hx-target` for dynamic content loading

## Alpine.js Integration

Alpine manages UI state that htmx doesn't cover:

- Modal open/close state
- Tab switching
- Message detail toggling (basic vs expanded view)
- Toast notifications
- Form validation feedback

### Example: Message Detail Toggle

```html
<div x-data="{ showDetails: false }">
  <button @click="showDetails = !showDetails">
    <span x-text="showDetails ? 'Hide' : 'Show'">Show</span> Details
  </button>
  <div x-show="showDetails" x-transition>
    <!-- Token count, speed, cost stats -->
  </div>
</div>
```

## Static Assets

All CSS, JS, images, and fonts:

1. Stored in `src/public/` or generated to `dist/public/`
2. Pre-compressed at build time
3. Served with aggressive caching headers
4. Content-hash filenames for cache busting

## TUI Mode

Separate from web frontend. Uses blessed widgets directly, communicates with same REST API.

For full TUI spec see [`docs/tui.md`](./tui.md).

## Web vs TUI Feature Parity

| Feature         | Web                    | TUI                    |
| --------------- | ---------------------- | ---------------------- |
| Chat            | htmx forms + Alpine    | blessed Log widget     |
| Gallery         | htmx lazy load         | blessed Box navigation |
| Message details | Alpine toggle          | Blessed list expand    |
| User settings   | Form + htmx            | Config file / env vars |
| Docs viewer     | htmx + Markdown render | Not planned (use web)  |
