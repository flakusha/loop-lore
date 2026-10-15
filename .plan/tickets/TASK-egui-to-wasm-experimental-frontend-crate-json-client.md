<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui to WASM experimental frontend crate (JSON client)

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend
**Tags:** egui, rust, wasm, experimental

**Summary:**

User directive 2026-10-15: proceed with development of egui as a separate experimental WASM frontend integrated by JSON communication, not htmx fragments. This supersedes the epic's near-term do-not-adopt verdict for this experimental path only (explicit user opt-in; production adoption stays out of scope). Deliver the Rust crate native/loop-lore-egui: eframe on the glow backend, wasm32-unknown-unknown, no cargo workspace entry (CI cargo-audit is scoped to native/loop-lore-native and stays unchanged). The crate loads its context from localStorage key loop-lore.egui-context.v1, talks JSON to GET /api/v1/chats and GET/POST /api/v1/chats/:id/messages with the X-CSRF-Token double-submit from the csrf_token cookie, renders one chat screen (list, messages, composer), and writes context back on transfer. Pure modules (context parse/serialize, URL building, response parsing, CSRF cookie extraction) carry host unit tests; the wasm fetch/mount layer is the only wasm-gated code.

Progress note (2026-10-16): the crate (context/api/app/storage/client/web modules) is written on this branch and its host unit tests pass (`cargo test`: 17 passed, 2 suites). The wasm32 build was blocked on this host (no rustup, no wasm std in either system install) and is now unblocked by scripts/native/ (see 65eba5afa); running `bun run build:egui` and the browser round-trip was deferred by user directive 2026-10-16 and remains the open gap.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
