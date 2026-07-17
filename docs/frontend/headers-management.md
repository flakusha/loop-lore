# Frontend & Backend Headers Management

## Overview

Headers in loop-lore are managed at two layers:

1. **Backend Response Headers** — Security, performance, observability headers applied to all HTTP responses
2. **Frontend Header Components** — Page-specific UI headers rendered via htmx navigation

Both layers work together to provide a secure, performant experience with consistent navigation UX.

---

## Backend: Response Header Policy

### Location

`src/middleware/response-headers.ts`

### ResponseHeaderPolicy Class

Centralizes security/performance/observability header injection. Constructed once per server start from `config.headers`, then applied via `headerPolicy.apply({ request, response })` at the top of the fetch handler.

### Route Classification

Responses classified into kinds driving header sets:

| Kind     | Detection                 | Headers Applied                                                      |
| -------- | ------------------------- | -------------------------------------------------------------------- |
| `html`   | `Content-Type: text/html` | Full CSP, COOP, COEP, Permissions-Policy, Link preload, client hints |
| `api`    | Path starts with `/api/`  | Permissions-Policy, Reporting-Endpoints, NEL                         |
| `static` | Everything else           | CORP from config                                                     |

### Security Headers

| Header                         | Condition      | Security Purpose                      |
| ------------------------------ | -------------- | ------------------------------------- |
| `Referrer-Policy`              | Always         | Controls referrer leakage             |
| `X-Content-Type-Options`       | Config enabled | Prevents MIME sniffing                |
| `X-Frame-Options`              | Config enabled | Clickjacking defense                  |
| `Content-Security-Policy`      | Config enabled | Script/style resource restrictions    |
| `Cross-Origin-Opener-Policy`   | Config enabled | Isolation context for HTML            |
| `Cross-Origin-Embedder-Policy` | Config enabled | Required for WASM/SharedArrayBuffer   |
| `Cross-Origin-Resource-Policy` | Static only    | Controls cross-origin resource access |

### Performance Headers

| Header                                | Condition                   | Purpose                                   |
| ------------------------------------- | --------------------------- | ----------------------------------------- |
| `Link: <...>; rel=preload`            | HTML + config preload paths | Resource hints for critical assets        |
| `Accept-CH` / `Critical-CH`           | HTML + config client hints  | Client hint negotiation                   |
| `Cache-Control: max-age=X, immutable` | Hashed assets               | Long-term caching for fingerprinted files |

### Observability Headers

| Header                | Condition            | Purpose                                                |
| --------------------- | -------------------- | ------------------------------------------------------ |
| `Reporting-Endpoints` | HTML or API + config | Endpoint for CSP/COOP violation reports                |
| `NEL`                 | Config enabled       | Network error logging                                  |
| `Timing-Allow-Origin` | HTML + config        | Resource timing API access for performance measurement |

### Design Notes

- **Additive**: Existing route headers never clobbered (SSE `Content-Type`/`Cache-Control` preserved)
- **Streaming-safe**: Re-wraps via `new Response(response.body, …)` — never buffers SSE
- **Config-driven**: All behaviors controlled via `config.headers` block in schema

---

## Backend: Dynamic Response Policy

### Location

`src/middleware/dynamic-response.ts`

### Body Optimization Pipeline

Applied to runtime-templated responses (views, API JSON) before header policy:

```
Validate (html/css/js) → Minify (whitespace/comments) → Compress (br/gzip)
```

| Step     | Config Flag      | Purpose                             |
| -------- | ---------------- | ----------------------------------- |
| Validate | `validate: true` | Parse check; log warning on failure |
| Minify   | `minify: true`   | Reduce payload size                 |
| Compress | `compress: true` | Apply Content-Encoding negotiated   |

### Exclusions

- `text/event-stream` (SSE) — streaming, never buffered
- Already `Content-Encoding` present bodies — passthrough
- Non-text content types — bypass entirely

---

## Frontend: Header Components

### Location

- `src/components/chat/chat-header.html` — Chat page header
- `src/views/*/` — Each view contains header slot with page title/actions

### Header Slot Pattern

The layout (`src/views/layout.html`) contains an empty header placeholder:

```html
<header id="header-slot" class="main-header"></header>
```

Each view template includes its header at the top:

### Header Management JavaScript

Located in `src/frontend/alpine/htmx.ts`:

### Header Test Coverage

E2E tests in `tests/e2e/flows/browser/navigation.browser.ts`:

---

## Implemented Improvements

### Backend

1. ✅ **Header Key Normalization** (`src/middleware/response-headers.ts`)
   - `normalizeHeaderKey()` function standardizes casing
   - Prevents duplicate headers from case mismatches

2. ✅ **Timing-Allow-Origin Support**
   - Configurable via `headers.timingAllowOrigin`
   - Enables `performance.getEntriesByType('resource')` for asset measurement

### Frontend

1. ✅ **Dynamic Title Updates** (`src/frontend/alpine/htmx.ts`)
   - `htmx:afterSwap` listener updates `<title>` from header content
   - Ensures browser tab shows correct page title after htmx navigation

---

## Proposed Improvements (Future)

### Backend

1. **Header Key Normalization**
   - Prevent `content-type` vs `Content-Type` casing conflicts
   - Add utility function in `response-headers.ts`

2. **CSP Nonce Support**
   - Current: `'unsafe-inline'` + `'unsafe-eval'` required for Alpine.js
   - Alpine uses `new Function()` for expression evaluation (`'unsafe-eval`)
   - Alpine's `@x` directive override uses innerHTML injection (`'unsafe-inline` needed)

3. **Cache-Control Presets**
   - Configurable max-age per route kind
   - HTML: 0-60s, API: 60s, Static hashed: 31536000s

4. **Early Hints (103)**
   - Implement `preResponseHook` for Link preload push
   - Bun supports 103 responses natively

5. **Timing-Allow-Origin**
   - Config for resource timing exposure
   - Enable frontend performance measurement

### Frontend

1. **Header Component Extraction**
   - Single template with parameterized slots
   - htmx OOB swap for title/actions

2. **Dynamic Title Updates**
   - `htmx:afterSwap` listener to sync `<title>` with header

3. **Breadcrumb Support**
   - `data-breadcrumb` attribute on views
   - Automatic path rendering in header

4. **Actions Configuration**
   - JSON-based actions visibility
   - Reduce template conditionals

---

## Configuration Reference

### Headers Config Schema (`src/config/schema.ts`)
