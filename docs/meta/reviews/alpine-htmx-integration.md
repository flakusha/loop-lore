# Review: Alpine.js + htmx Integration

**Date**: 2026-07-12
**Scope**: Bridge layer (`htmx.ts`), layout (`layout.html`), chat lifecycle (`chat.ts`), toasts (`ui.ts` + `app.ts`), notifications (`notifications.ts`)
**Reviewer**: opencode

## Architecture

Clean separation: htmx owns DOM swapping/routing, Alpine owns reactive state. Bridge
in `src/frontend/alpine/htmx.ts` handles Alpine init on htmx swaps, auth header
injection, and custom event dispatch for grid refresh.

Key integration points:

- `hx-swap="morph"` + `hx-ext="alpine-morph"` preserves Alpine state across page nav
- `apiFetch()` shared auth/CSRF between both layers
- `data-hx-success-event` custom event bridge for htmx -> Alpine communication
- `MutationObserver` for component cleanup (more robust than documented `@htmx:before-swap.window`)

## Findings

### HIGH — Fix Applied

| ID    | File:Line                 | Finding                                                                                                                                                                                                                                                   | Status |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ALP.1 | `chat.ts:188-205`         | Keydown listener (Escape, Ctrl+J) registered in `init()` but never removed in `destroy()`. After htmx morph re-init, handlers stack — Escape/Ctrl+J fire multiple times.                                                                                  | Fixed  |
| ALP.2 | `ui.ts:59` + `app.ts:47`  | Both `ui.ts` and `app.ts` listen for `show-toast` custom event. On chat page (Alpine loaded), both fire — creating duplicate toasts. Non-Alpine pages (login) get single toast correctly.                                                                 | Fixed  |
| ALP.3 | `page-loaders.ts:566-619` | Settings page has dual initialization: Alpine `settingsPage()` component + vanilla JS `loadSettingsPage()`. The page-loader adds event listeners to form elements already managed by Alpine `x-model` — potential for duplicate handlers and stale state. | Fixed  |

### MEDIUM — Fix Applied

| ID    | File:Line                          | Finding                                                                                                                                                                                           | Status |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ALP.4 | `htmx.ts:77-80`                    | `Alpine.initTree()` on `htmx:load` only initializes `[x-data]` children of the swapped element, not the swapped element itself. Root `[x-data]` on server-returned partials won't be initialized. | Fixed  |
| ALP.5 | `app.ts:25-37` + `htmx.ts:135-147` | Duplicate `$store.ui` initialization in both `app.init()` and `initAlpineStores()`. `app.ts` always overwrites without guard. If `app()` runs after `htmx.ts`, values reset.                      | Fixed  |

### LOW — Fix Applied

| ID    | File:Line             | Finding                                                                                                                                                           | Status |
| ----- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ALP.6 | `notifications.ts:40` | `htmx:afterSwap` listener registered in `start()` but not removed in `stop()`. Guarded by `this.started` flag but not idempotent for `stop()` + `start()` cycles. | Fixed  |
| ALP.7 | `chat.ts:97-100`      | Cleanup handle types use `(() => {})` (empty object type) instead of `(() => void)`. Assertion masks the type error.                                              | Fixed  |

### INFO — Noted

| ID     | File:Line                                       | Finding                                                                                                                                                       | Status |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ALP.8  | `layout.html:119`                               | Root `app()` on `<body>` means Alpine manages entire body scope. Intentional — morph swaps inherit the scope. Architectural note only.                        | N/A    |
| ALP.9  | `htmx.ts:160`                                   | Repeated `(e as CustomEvent<{...}>)` cast pattern. Minor style nit.                                                                                           | N/A    |
| ALP.10 | `htmx.ts:103`                                   | `normalizeHeaderSlot` sets `best = all[0]` as fallback even if outside `appRoot`, then `contains` check prevents move. Edge case with no duplicates possible. | N/A    |
| ALP.11 | `docs/frontend/component-architecture.md:32-36` | Documents `@htmx:before-swap.window="destroy()"` pattern but code uses `MutationObserver` instead. Documentation drift — the code approach is more robust.    | N/A    |
