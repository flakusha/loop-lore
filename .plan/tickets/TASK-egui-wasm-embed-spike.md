<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: egui→WASM embed spike — measure, do not ship

**Status:** In Progress
**Status Note:** Measurement shipped and the verdict is "still no"; one
acceptance criterion is unmet — the addendum was written as a standalone
findings document instead of being appended inside
`docs/meta/research/egui-frontend-adoption.md`, per the two-file diff constraint
for this change.
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

- [x] A release WASM build exists for both backends and the recorded numbers
  are: cold `cargo build --release --target wasm32-unknown-unknown` wall time,
  and `.wasm` bytes raw and after brotli/gzip. Measured, not estimated.
- [x] The recorded `cargo audit` / `cargo tree` dependency count for the spike
  crate is compared against `native/loop-lore-native`, so the marginal audit
  surface of adding `eframe` is a number.
- [x] A written DOM-interop verdict exists, covering: focus handling next to
  Alpine-managed inputs, whether an htmx swap of the surrounding subtree
  detaches or strands the canvas, and text-input coexistence.
- [ ] The result is appended to `docs/meta/research/egui-frontend-adoption.md`
  as a dated addendum, replacing open question 3 with the measurement.
  **Not met.** The addendum was written as the standalone
  `docs/meta/research/egui-wasm-embed-spike.md` (dated 2026-10-14, §6 replaces
  open question 3) because this change was scoped to touch exactly two files:
  that new document and this ticket. Adding the pointer inside
  `egui-frontend-adoption.md` §6 Q3 is the one remaining edit, and it is a
  link-only change.
- [x] `git status` in the worktree shows **zero** non-`.tmp/` changes from this
  ticket. The spike crate is deleted before the ticket closes.
- [x] The verdict is a recommendation, and it is allowed to be "still no". The
  ticket's success is the measurement, not a positive result.

## Related Files

- `native/loop-lore-native/rust-toolchain.toml` — the pinned toolchain reused
- `native/loop-lore-native/Cargo.toml` — the existing Rust dependency baseline
- `package.json:16-21` — `lint:native` / `test:native` / `format:native`
- `.github/workflows/audit.yml:35-46` — the RustSec audit the spike must not
  quietly widen
- `docs/meta/research/egui-wasm-embed-spike.md` — the findings document this
  ticket produced

## Measured Evidence (2026-10-14)

Full write-up, with commands, method and citations:
`docs/meta/research/egui-wasm-embed-spike.md`. Every figure below was produced
by a build run in this worktree's gitignored `.tmp/` on 2026-10-14; the scratch
crate has been deleted. Nothing under `src/`, `native/`, `package.json` or
`.plan/` other than this ticket changed.

### Environment

| Item | Value |
| ---- | ----- |
| Host | linux 7.2.9, x86_64, 32 CPU threads (`nproc`) |
| System Rust | `rustc 1.99.0 (b940084d7 2026-09-28)`; `rustup` **absent** |
| `wasm32-unknown-unknown` std | **absent** from the system toolchain — had to be installed |
| Toolchain under test | `rustc 1.97.1 (8bab26f4f 2026-07-14)` — the repo's pinned version — installed from `https://static.rust-lang.org/dist/2026-07-16/` together with `rust-std-1.97.1-wasm32-unknown-unknown` (sha256 `fa0edb6e9f34faae5735554d62d50875eded839dc707d0f1c01467a918d8453b`) |
| `eframe` version resolved | 0.36.2 (`edition = "2024"`, `rust-version = "1.95"` — satisfied by the pinned 1.97.1) |
| `wasm-opt` / `cargo-audit` | absent / not installed |

### Build time and bundle bytes

Build command (verbatim, per backend):

```
export PATH=<worktree>/.tmp/rust197/bin:$PATH
export CARGO_TARGET_DIR=<worktree>/.tmp/target197-<backend>
rm -rf "$CARGO_TARGET_DIR"                      # cold run only
cargo build --release --target wasm32-unknown-unknown --no-default-features \
  --features <glow|wgpu> --manifest-path <worktree>/.tmp/egui-spike/Cargo.toml
```

`glow`, pinned `rustc 1.97.1`:

| | Value |
| --- | ---: |
| Cold wall time | **93 s** |
| Warm wall time (`touch src/lib.rs`, deps cached) | **18 s** |
| `.wasm` raw | **5,896,841 bytes** |
| `.wasm` brotli (`brotli -f -q 11`) | **1,589,840 bytes** |
| `.wasm` gzip (`gzip -9`) | **2,060,106 bytes** |

`wgpu`, pinned `rustc 1.97.1`:

| | Value |
| --- | ---: |
| Cold wall time | **143 s** |
| Warm wall time | **42 s** |
| `.wasm` raw | **9,746,021 bytes** |
| `.wasm` brotli (`brotli -f -q 11`) | **2,302,489 bytes** |
| `.wasm` gzip (`gzip -9`) | **3,147,414 bytes** |

Cross-check on the system `rustc 1.99.0` (same crate, same flags): `glow`
84 s / 17 s, 5,923,366 raw / 1,604,026 brotli / 2,070,462 gzip; `wgpu` 126 s /
31 s, 9,719,778 raw / 2,316,879 brotli / 3,152,633 gzip. Both backends compile
and link for `wasm32-unknown-unknown` on both toolchains.

Caveats, stated so these numbers are not over-read: "cold" means an empty
`CARGO_TARGET_DIR` with a warm crates.io registry cache (no network-download
time included), and the sizes are **not** `wasm-opt`-optimized. The
`wasm-bindgen` `.js` glue size was **not measured** — that CLI is not installed.

### Dependency and advisory surface

| | `native/loop-lore-native` | spike `glow` | spike `wgpu` |
| --- | ---: | ---: | ---: |
| `cargo tree` lines | 18 | 171 | 288 |
| unique third-party crates | **15** | **88** | **110** |
| marginal vs baseline | — | **+73** | **+95** |
| `Cargo.lock` unique crates | 18 | 284 (both backends) | 284 |

`cargo audit` is **not installed** and was not run. The RustSec advisory DB is
reachable, so as a strictly weaker substitute the spike cloned
`rustsec/advisory-db` at `6aed84668c23d7f535077a9fe918bf1fa0f6a5bc` (1,290
advisories) and matched `Cargo.lock` crate **names** against it: **2 of 18**
crates in `native/loop-lore-native` (`arrayref`, `shlex`) and **23 of 284** in
the spike lock have an advisory of *some* version. Semver ranges were **not**
resolved, so this is a surface count, not a vulnerability verdict — a real
`cargo audit` would have 21 more crates to reason about, not 21 new
vulnerabilities.

### DOM-interop verdict

Verbatim, three mechanics, all sourced at `emilk/egui@b25d2d45`:

1. **Startup focus theft.** `TextAgent::attach` creates a real
   `<input type="text">`, styles it invisible (`opacity: 0`,
   `pointer-events: none`, `1px` — `crates/eframe/src/web/text_agent.rs:36-50`),
   inserts it **as a sibling of the canvas**
   (`text_agent.rs:58-63`), and then **focuses it** at startup
   (`text_agent.rs:65-70`, "Focus the app on startup, without scrolling the
   page", citing [emilk/egui#8295](https://github.com/emilk/egui/issues/8295)).
   Mounting a canvas on a page that also has an Alpine-managed input therefore
   blurs that input on load. Upstream's own README says the same thing in prose:
   "`eframe` fakes it by adding some invisible DOM elements"
   (`crates/eframe/README.md:42`).
2. **The island owns the document's single focus slot while active.** All
   key/IME listeners are on that hidden input (`text_agent.rs:74+`), and
   `set_focus`/`focus`/`blur` act on it (`text_agent.rs:137-172`) via
   `focus_without_scroll` = `focus({preventScroll: true})`
   (`crates/eframe/src/web/mod.rs:89-97`). Unfocused, it does not interfere
   (`pointer-events: none`); focused, no other element can be.
3. **An htmx swap strands the canvas.** htmx's default swap is `innerHTML`
   (`node_modules/htmx.org/dist/htmx.js:100`, `htmx.org@2.0.11`) and
   `swapInnerHTML` (`:1774-1785`) `removeChild`s the previous children. Nothing
   tells the WASM side. The frame loop is self-perpetuating and node-unaware
   (`crates/eframe/src/web/web_runner.rs:243-281`) and a `ResizeObserver` is
   left observing the detached canvas (`web_runner.rs:87`), so the app keeps
   running while invisible. Recovery means calling `WebRunner::start` again on a
   fresh canvas. In a repo whose view model *is* subtree replacement, that is
   the normal lifecycle event, not an edge case.

Measured fact vs inference: (1)–(3) are code/doc facts with `path:line`. The
conclusions drawn from them — that the page would blur an Alpine input, and
that the canvas is stranded rather than detached-and-reported — are labelled
inferences in the findings doc §5.2 and were **not** observed in a browser
(no browser harness on this host).

### Verdict

**Still no.** The recommendation in `docs/meta/research/egui-frontend-adoption.md`
does not change. Both unknowns the research doc flagged are immaterial: build
time is 93 s/143 s cold on 32 threads, and the marginal audit surface is
+73/+95 crates over a baseline that already carries 2. The cost that does
matter is 1.59 MB brotli (`glow`) to 2.30 MB (`wgpu`) for a *one-panel* app —
~10× `src/views/admin.html` (157,755 bytes), 14.6× for `wgpu` — before a
single product screen exists. The DOM verdict got more specific and no friendlier. `glow`, not
`wgpu`, is the backend worth choosing if this is ever revisited, and it has to
live outside the htmx swap lifecycle.

**No egui UI was shipped.** Nothing was added to `src/views/`, `src/frontend/`,
or the Elysia app.

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*