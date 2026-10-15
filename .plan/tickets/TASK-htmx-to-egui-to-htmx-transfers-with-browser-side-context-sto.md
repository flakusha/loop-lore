<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: htmx to egui to htmx transfers with browser-side context storage

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend
**Tags:** egui, wasm, htmx, experimental

**Summary:**

User directive 2026-10-15. Shared browser-side context contract between the htmx/Alpine frontend and the egui WASM frontend: localStorage key loop-lore.egui-context.v1 holding {version:1, activeChatId, returnTo}; malformed or wrong-version payloads fall back to defaults. Deliver src/frontend/egui-bridge.ts (read/write context, handoffToEgui writes context then navigates to /egui, returnToHtmx writes context then navigates to returnTo defaulting to /views/chat), unit tests with a fake localStorage, an Open in egui entry button on the chat page (src/views/chat.html, data-testid=open-in-egui) calling the bridge, the egui host page at /egui with canvas plus glue plus a DOM Back to htmx control (data-testid=egui-back-to-htmx), wasm MIME and brotli variant serving in the static handler, scripts/build-egui-wasm.ts (cargo wasm build, wasm-bindgen glue, brotli sibling), and a Playwright round-trip e2e test asserting the transfer and the stored context.

Build note (2026-10-16): the wasm toolchain prerequisite is resolved by scripts/native/ (toolchain.ts discovery, provision.ts component install, shared.ts constants; test toolchain.test.ts; run `bun run native:toolchain`). The build stages resolve a wasm-capable rustc for the rustup, distro-multi-slot, and offline cases without copying files between installs, and scripts/build-native.ts + scripts/build-egui-wasm.ts consume the resolver. The browser-side context storage itself is implemented on this branch (egui-bridge.ts, the /egui host route, the chat header entry button, wasm MIME + brotli serving) with unit tests green; the Playwright round-trip and `bun run build:egui` remain pending the wasm artifact build, deferred by user directive 2026-10-16.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
