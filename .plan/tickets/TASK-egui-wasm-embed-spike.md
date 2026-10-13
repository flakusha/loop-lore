<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: egui→WASM embed spike — measure, do not ship

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** `epic-experimental-egui-frontend`
**Tags:** egui, rust, wasm, spike, research, experimental
**Related:** `.plan/epics/epic-experimental-egui-frontend.md`, `.plan/epics/epic-precompiled-hot-binaries.md`, `.plan/epics/epic-terminal-ui.md`, `docs/meta/research/egui-frontend-adoption.md`
**Summary:** Build a throwaway `eframe`→WASM canvas on top of one existing htmx page, record real build times and bundle bytes for both backends, write a DOM-interop verdict, then delete it.
**Context:** `docs/meta/research/egui-frontend-adoption.md` §2 leaves three things unmeasured, and this ticket is the only place they get answered. (1) `eframe`'s default `wgpu` backend pulls a far larger dependency tree than the existing `blake3` + `zstd` in `native/loop-lore-native/`, and the compile-time and `cargo audit` surface cost on top of that crate is unknown — research open question 3. (2) The 4,389,649 transfer bytes measured on the shipped demo at <https://www.egui.rs/> are the *demo app*, not a product build; a minimal product build needs its own number. (3) `WebRunner::start(canvas, …)` takes a caller-supplied canvas and `focus_without_scroll` exists for the embedded-in-a-scrollable-page case (`crates/eframe/src/web/mod.rs:89-98`), so embedding is API-supported — but whether an egui canvas coexists with 51 Alpine components and htmx swaps in one document is a product question no doc answers. Note the stale-crate trap: `egui_web` is frozen at 0.17.0 (last published 2022-02-22); web support lives in `eframe` under the `wasm32` target. This ticket ships **no UI**.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Scope

- A scratch Rust crate under gitignored `.tmp/` (never committed, never under
  `src/` or `native/`) that builds to WASM with `eframe`, mounting a
  `WebRunner::start` canvas into an existing htmx page.
- Two release builds: default backend (`wgpu`) and `glow`, since
  `crates/eframe/Cargo.toml` documents glow as the size-reducing choice and
  [emilk/egui#5889](https://github.com/emilk/egui/issues/5889) measured
  5.9 MiB vs 8.3 MiB uncompressed for the demo.
- A written verdict: can an egui canvas and the server-rendered htmx DOM
  coexist in one document without either fighting for focus or input?

## Out of Scope

- Any production wiring. No file under `src/`, `src/views/`, `src/public/`,
  `src/frontend/`, `native/`, or the Elysia app may change. A leftover
  production file is a failure of this ticket, not a starting point.
- A second Cargo crate checked into the repo. The Rust toolchain is pinned at
  `native/loop-lore-native/rust-toolchain.toml` (1.97.1) and stays the only
  pinned toolchain; the spike reuses it rather than adding a second pin.
- Native/eframe desktop (option (a)) — rejected in the research doc §3a and
  out of scope here.

## Acceptance Criteria

- [ ] A release WASM build exists for both backends and the recorded numbers
  are: cold `cargo build --release --target wasm32-unknown-unknown` wall time,
  and `.wasm` bytes raw and after brotli/gzip. Measured, not estimated.
- [ ] The recorded `cargo audit` / `cargo tree` dependency count for the spike
  crate is compared against `native/loop-lore-native`, so the marginal audit
  surface of adding `eframe` is a number.
- [ ] A written DOM-interop verdict exists, covering: focus handling next to
  Alpine-managed inputs, whether an htmx swap of the surrounding subtree
  detaches or strands the canvas, and text-input coexistence.
- [ ] The result is appended to `docs/meta/research/egui-frontend-adoption.md`
  as a dated addendum, replacing open question 3 with the measurement.
- [ ] `git status` in the worktree shows **zero** non-`.tmp/` changes from this
  ticket. The spike crate is deleted before the ticket closes.
- [ ] The verdict is a recommendation, and it is allowed to be "still no". The
  ticket's success is the measurement, not a positive result.

## Related Files

- `native/loop-lore-native/rust-toolchain.toml` — the pinned toolchain reused
- `native/loop-lore-native/Cargo.toml` — the existing Rust dependency baseline
- `package.json:16-21` — `lint:native` / `test:native` / `format:native`
- `.github/workflows/audit.yml:35-46` — the RustSec audit the spike must not
  quietly widen

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*