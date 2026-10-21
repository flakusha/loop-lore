# htmx 2 → 4 migration research

Current pin: `htmx.org@2.0.11`. Target: htmx 4.x (npm latest stays 2.x until early 2027; 4.0 released 2026-08-28).

## Biggest impacts on this repo

- **Event renames** (src/frontend/alpine/htmx.ts, telemetry.ts, notifications.ts, pages/blog.ts, window-types.ts): `htmx:afterSwap`→`htmx:after:swap`, `htmx:beforeSwap`→`htmx:before:swap`, `htmx:configRequest`→`htmx:config:request`, `htmx:afterRequest`→`htmx:after:request`, `htmx:responseError`→`htmx:response:error`, `htmx:afterSettle`→`htmx:after:settle`.
- **Explicit inheritance**: any `hx-confirm`/`hx-target`/`hx-include` inherited down DOM now needs `:inherited`. Revert via `htmx.config.implicitInheritance = true` for low-risk interim.
- **Error responses now swap** by default (4xx/5xx). Our 401/422 handling may need `hx-status` or `noSwap` revert. Check routes returning HTML errors.
- **hx-delete no longer includes form data**: add `hx-include="closest form"` where forms use hx-delete.
- **Extension loading**: remove `hx-ext` attribute usage (none found?), include scripts directly. We already `require("htmx.org/dist/ext/alpine-morph.js")` and `htmx-ext-sse/sse.js`. htmx 4 core extensions (sse) may ship differently.
- **hx-vars removed** → use `js:` prefix in `hx-vals`. Search for hx-vars (none?).
- **hx-disable semantics flip**: rename to `hx-ignore` for "skip processing"; `hx-disable` becomes disabled-elt. Need audit.
- **Config renames**: `defaultSwapStyle`→`defaultSwap`, `timeout`→`defaultTimeout`, `includeIndicatorStyles`→`includeIndicatorCSS`, `historyEnabled`→`history`, `globalViewTransitions`→`transitions`.
- **JS API**: `htmx.ajax`, `htmx.process`, `htmx.trigger` still available; verify signatures.
- **OOB swap order**: main first now; check any OOB creating DOM main depends on.

## Recommended approach

1. Stay on 2.x until needed (npm latest).
2. If upgrading, set `htmx.config.implicitInheritance = true` and `noSwap = [204,304,'4xx','5xx']` to preserve 2.x behavior.
3. Rename events and attributes incrementally behind tests.
4. Run e2e suite (`E2E_SAFEGUARD=1`).

## Files to touch (primary)

- src/frontend/alpine/htmx.ts
- src/frontend/alpine/alpine-init.ts
- src/frontend/dom.ts
- src/frontend/notifications.ts
- src/frontend/telemetry.ts
- src/frontend/pages/blog.ts
- src/frontend/window-types.ts
- views/**/*.html, partials/**/*.html, components/**/*.html
