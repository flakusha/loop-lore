<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: htmx to egui to htmx transfers with browser-side context storage

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend
**Tags:** egui, wasm, htmx, experimental

**Summary:**

User directive 2026-10-15. Shared browser-side context contract between the htmx/Alpine frontend and the egui WASM frontend: localStorage key loop-lore.egui-context.v1 holding {version:1, activeChatId, returnTo}; malformed or wrong-version payloads fall back to defaults. Deliver src/frontend/egui-bridge.ts (read/write context, handoffToEgui writes context then navigates to /egui, returnToHtmx writes context then navigates to returnTo defaulting to /views/chat), unit tests with a fake localStorage, an Open in egui entry button on the chat page (src/views/chat.html, data-testid=open-in-egui) calling the bridge, the egui host page at /egui with canvas plus glue plus a DOM Back to htmx control (data-testid=egui-back-to-htmx), wasm MIME and brotli variant serving in the static handler, scripts/build-egui-wasm.ts (cargo wasm build, wasm-bindgen glue, brotli sibling), and a Playwright round-trip e2e test asserting the transfer and the stored context.

Build note (2026-10-16): the wasm toolchain prerequisite is resolved by scripts/native/ (toolchain.ts discovery, provision.ts component install, shared.ts constants; test toolchain.test.ts; run `bun run native:toolchain`). The build stages resolve a wasm-capable rustc for the rustup, distro-multi-slot, and offline cases without copying files between installs, and scripts/build-native.ts + scripts/build-egui-wasm.ts consume the resolver.

Delivery status (2026-10-16, branch `egui-wasm-frontend`): the browser-side context contract is implemented with ONE canonical TS implementation (src/frontend/egui-bridge.ts) and one pure Rust mirror (the egui crate's context module, host-tested). The /egui host route delegates the back button to `window.loopLoreEgui.returnToHtmx()` instead of re-implementing the contract.

Round-trip verified in a real browser (2026-10-16, headless Chromium, with the wasm bundle built): chat -> open-in-egui writes `{version:1, activeChatId, returnTo:"/views/chat?chatid=<id>"}` at key loop-lore.egui-context.v1, /egui mounts the wasm (`egui ready`, webgl2 canvas), the wasm's own `/api/v1/chats` fetch answers 200 with the session cookie (csrf_token cookie visible to JS for the double-submit), and the DOM Back to htmx button navigates back to returnTo with the context preserved. The Playwright e2e (tests/e2e/flows/browser/egui-transfer.browser.ts) is green both with the bundle present and with it absent (the /egui/app.js + /egui/app_bg.wasm 404s stay allowlisted for envs that do not compile wasm).

Three transport bugs were fixed on the way: the bridge bundle needed `--format=iife` (bun appends `export{…}` after banner/footer when the entry has real exports, a hard syntax error for a classic script); view templates' bare bundle names (/alpine-init.js, /pages.js) now resolve to their content-hashed dist siblings via `resolvePublicFilePath` in src/server/static-files.ts (this also repaired pre-existing view e2e 404s); and the host page's glue call was stale (`wasm_bindgen("/egui/app.wasm")`) — wasm-bindgen 0.2.129 emits a default export that resolves `app_bg.wasm` relative to the glue, so the page calls it with no argument.

The earlier open gap (`bun run build:egui` stopped at preflight for a missing wasm-bindgen CLI) was WRONG — the CLI is installed and answers at the Cargo.lock-pinned version. The full pipeline (toolchain resolve, wasm32 compile, wasm-bindgen, brotli) runs clean; see TASK-egui-to-wasm-experimental-frontend-crate-json-client for the two build-script fixes that made it work.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
