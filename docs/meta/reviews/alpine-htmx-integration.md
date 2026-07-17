# Review: Alpine.js + htmx Integration

**Date**: 2026-07-12
**Scope**: Bridge layer (`htmx.ts`), layout (`layout.html`), chat lifecycle (`chat.ts`), toasts (`ui.ts` + `app.ts`), notifications (`notifications.ts`)

## Architecture

Clean separation: htmx owns DOM swapping/routing, Alpine owns reactive state. Bridge in `src/frontend/alpine/htmx.ts` handles Alpine init on htmx swaps, auth header injection, custom event dispatch for grid refresh.

Key integration points:

- `hx-swap="morph"` + `hx-ext="alpine-morph"` preserves Alpine state across nav
- `apiFetch()` shared auth/CSRF
- `data-hx-success-event` custom event bridge
- `MutationObserver` for component cleanup

## Findings

### HIGH — All Fixed

| ID    | File:Line                 | Finding                                                                                                | Status |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| ALP.1 | `chat.ts:188-205`         | Keydown listener registered in `init()` never removed in `destroy()` — handlers stack on morph re-init | Fixed  |
| ALP.2 | `ui.ts:59` + `app.ts:47`  | Both listen for `show-toast` — duplicate toasts on chat page                                           | Fixed  |
| ALP.3 | `page-loaders.ts:566-619` | Settings page dual init (Alpine + vanilla JS) — duplicate handlers                                     | Fixed  |

### MEDIUM — All Fixed

| ID    | File:Line                          | Finding                                                                  | Status |
| ----- | ---------------------------------- | ------------------------------------------------------------------------ | ------ |
| ALP.4 | `htmx.ts:77-80`                    | `Alpine.initTree()` misses root `[x-data]` on swapped element            | Fixed  |
| ALP.5 | `app.ts:25-37` + `htmx.ts:135-147` | Duplicate `$store.ui` initialization — `app.ts` overwrites without guard | Fixed  |

### LOW — All Fixed

| ID    | File:Line             | Finding                                                         | Status |
| ----- | --------------------- | --------------------------------------------------------------- | ------ |
| ALP.6 | `notifications.ts:40` | `htmx:afterSwap` listener not removed in `stop()`               | Fixed  |
| ALP.7 | `chat.ts:97-100`      | Cleanup handle types use `(() => {})` instead of `(() => void)` | Fixed  |

### INFO — Noted

| ID     | File:Line                                       | Finding                                                                                             |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ALP.8  | `layout.html:119`                               | Root `app()` on `<body>` is intentional — morph swaps inherit scope                                 |
| ALP.9  | `htmx.ts:160`                                   | Repeated `(e as CustomEvent<...>)` cast pattern — minor style nit                                   |
| ALP.10 | `htmx.ts:103`                                   | `normalizeHeaderSlot` edge case with no duplicates possible                                         |
| ALP.11 | `docs/frontend/component-architecture.md:32-36` | Documents `@htmx:before-swap.window` pattern but code uses `MutationObserver` — documentation drift |
