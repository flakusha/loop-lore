<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui to WASM experimental frontend crate (JSON client)

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend
**Tags:** egui, rust, wasm, experimental

**Summary:**

User directive 2026-10-15: proceed with development of egui as a separate experimental WASM frontend integrated by JSON communication, not htmx fragments. This supersedes the epic's near-term do-not-adopt verdict for this experimental path only (explicit user opt-in; production adoption stays out of scope). Deliver the Rust crate native/loop-lore-egui: eframe on the glow backend, wasm32-unknown-unknown, no cargo workspace entry (CI cargo-audit is scoped to native/loop-lore-native and stays unchanged). The crate loads its context from localStorage key loop-lore.egui-context.v1, talks JSON to GET /api/v1/chats and GET/POST /api/v1/chats/:id/messages with the X-CSRF-Token double-submit from the csrf_token cookie, renders one chat screen (list, messages, composer), and writes context back on transfer. Pure modules (context parse/serialize, URL building, response parsing, CSRF cookie extraction) carry host unit tests; the wasm fetch/mount layer is the only wasm-gated code.

Progress note (2026-10-16): the crate (context/api/app/storage/client/web modules) is written on this branch and its host unit tests pass (`cargo test`: 18 passed, 2 suites — the earlier 17 grew by one when the CSRF cookie parser moved behind the wasm feature boundary).

Delivery status (2026-10-16, branch `egui-wasm-frontend`): the wasm-bindgen CLI IS installed on this host (the earlier open gap was wrong — the CLI answers `--version` at 0.2.129, matching Cargo.lock). `bun run build:egui` now runs its full pipeline: toolchain resolve (scripts/native/toolchain.ts) → cargo wasm32 release compile (glow backend, CARGO_TARGET_DIR=/tmp/cargo honored via `cargo metadata`) → wasm-bindgen `--target web` → `app_bg.wasm` + brotli variant. Two build-script bugs were fixed on the way: the artifact path assumed `<crate>/target` while the host sets CARGO_TARGET_DIR, and the brotli step looked for `app.wasm` when wasm-bindgen emits `app_bg.wasm`.

Browser verification (2026-10-16, headless Chromium): the /egui host page loads the real bundle and reaches `#egui-status` = `egui ready`, the canvas fills 1440x900 with an active webgl2 context, document.cookie exposes `csrf_token` (double-submit readable), and the JSON data plane the Rust client uses answers 200 (`/api/v1/chats` returns the solo chat; `/api/v1/chats/:id/messages` returns empty). Three API-shape fixes were needed against egui 0.36.2: `Panel::left/top` replaced the removed SidePanel/TopBottomPanel, `App::ui`/`App::logic` replaced `App::update`, and `WebRunner::start` is async (the `#[wasm_bindgen(start)]` entry is now `async`). The host page also had a stale glue call (`glue.wasm_bindgen("/egui/app.wasm")`) — wasm-bindgen emits a default export that resolves `app_bg.wasm` relative to the glue.

Hardening after review (2026-10-16): `FrontendContext::from_stored_json` now rejects an origin-absolute-but-off-origin `returnTo` — a scheme-relative `//evil.example` or absolute `https://…` value would navigate the user off-origin on return, so both sides (Rust + TS bridge) reject the same shapes and fall back to defaults (test: off_origin_return_to_is_discarded). The static handler serves the /egui js + wasm MIME types and the brotli variant for the once-per-visit bundle. `bun run lint:egui` (clippy -D warnings) and `cargo fmt --check` are green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete — native/loop-lore-egui (eframe + glow, wasm32-unknown-unknown) with one chat screen, no cargo workspace entry, on branch `egui-wasm-frontend`
- [x] Tests passing — `cargo test` host suites green; `bun run lint:egui` (clippy -D warnings) and `cargo fmt --check` green; the real bundle builds (`bun run build:egui`) and boots in headless Chromium (`egui ready`, wasm JSON calls 200)
- [x] Documentation updated — the crate/build/verification notes are recorded in this ticket and the companion transfer ticket; the epic index reflects the experimental opt-in
