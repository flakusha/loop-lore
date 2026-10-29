<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# egui→WASM embed spike: measured build cost, bundle bytes, DOM-interop verdict

**Date:** 2026-10-14
**Branch:** `chore-egui-wasm-spike`
**Ticket:** `.plan/tickets/TASK-egui-wasm-embed-spike.md` (epic
`.plan/epics/epic-experimental-egui-frontend.md`)
**Parent research:** `docs/meta/research/egui-frontend-adoption.md` (2026-10-13) —
this document **measures** what that document deferred; it does not re-argue its
conclusions.
**Question:** what does a minimal `eframe`→WASM app actually cost — build time,
bundle bytes, dependency and advisory surface — for the `glow` and `wgpu`
backends, and can an egui canvas and the server-rendered htmx/Alpine DOM coexist
in one document?
**Verdict in one line: still no.** The recommendation in the parent research doc
does **not** change. See §6.

---

## 1. Method and what was and was not measured

Every number in §2–§4 was produced on this host on **2026-10-14** by building a
throwaway crate under gitignored `.tmp/` of the `chore-egui-wasm-spike`
worktree. The crate is deleted; nothing under `src/`, `native/`, `package.json`
or `.plan/` was touched.

### 1.1 Host and toolchain (measured)

| Item | Value | How obtained |
| ---- | ----- | ------------ |
| OS / arch | linux 7.2.9, x86_64 | workstation report |
| CPU threads visible to `cargo` | 32 | `nproc` |
| System Rust | `rustc 1.99.0 (b940084d7 2026-09-28)`, `/opt/rust-bin-1.99.0` | `rustc --version` |
| `rustup` | **absent** (`command not found: rustup`) | `rustup toolchain list` |
| `wasm32-unknown-unknown` std, system toolchain | **absent** — only `x86_64-unknown-linux-gnu`, `i686-unknown-linux-gnu` under `/opt/rust-bin-1.99.0/lib/rustlib/` | directory listing |
| Pinned toolchain under test | `rustc 1.97.1 (8bab26f4f 2026-07-14)` + `rust-std-1.97.1-wasm32-unknown-unknown`, installed under `.tmp/rust197` | see §1.2 |
| `wasm-opt` | absent | `which wasm-opt` |
| `brotli` | present (`/usr/bin/brotli`) | `which brotli` |
| `cargo-audit` | **not installed** | `cargo --list` |

Two toolchain facts matter for how much weight the build numbers carry:

- The repo pins **1.97.1** (`native/loop-lore-native/rust-toolchain.toml:4`).
  This host has **no rustup**, so that pin is not honoured by the system
  `cargo`. To answer "does `eframe` compile against the pinned Rust version"
  honestly, the spike installed 1.97.1 plus its `wasm32-unknown-unknown` std
  from `static.rust-lang.org` into `.tmp/rust197` and ran the measured builds
  against **that**. The 1.99.0 numbers are a cross-check only.
- Adding the `wasm32-unknown-unknown` std is itself part of the toolchain cost,
  and it is not free: the repo's `rust-toolchain.toml` component list
  (`clippy`, `rustfmt`, `rust-analyzer`) names no wasm target, and no CI job
  installs one.

### 1.2 Toolchain provisioning commands (verbatim)

```
curl -sS --max-time 300 -o rust-std-1.97.1-wasm32.tar.xz \
  https://static.rust-lang.org/dist/2026-07-16/rust-std-1.97.1-wasm32-unknown-unknown.tar.xz
curl -sS --max-time 900 -o rust-1.97.1.tar.xz \
  https://static.rust-lang.org/dist/2026-07-16/rust-1.97.1-x86_64-unknown-linux-gnu.tar.xz
tar xf rust-1.97.1.tar.xz && tar xf rust-std-1.97.1-wasm32.tar.xz
./install.sh --prefix=<worktree>/.tmp/rust197 --disable-ldconfig     # both extracted trees
```

`rust-std-1.97.1-wasm32-unknown-unknown.tar.xz` sha256
`fa0edb6e9f34faae5735554d62d50875eded839dc707d0f1c01467a918d8453b`, from the
URL advertised by `channel-rust-stable.toml` at read time.

### 1.3 The spike crate

A `cdylib` crate, `default-features = false` with exactly one backend, because
`eframe` hard-fails without one
(`crates/eframe/src/web/mod.rs:29-30`, `emilk/egui@b25d2d45`):

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
eframe = { version = "0.36", default-features = false }
egui = { version = "0.36", default-features = false, features = ["default_fonts"] }
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4"
web-sys = { version = "0.3", features = ["HtmlCanvasElement"] }

[features]
default = ["wgpu"]
glow = ["eframe/glow", "eframe/default_fonts"]
wgpu = ["eframe/wgpu", "eframe/default_fonts"]

# mirrors native/loop-lore-native/Cargo.toml [profile.release]
[profile.release]
lto = "thin"
codegen-units = 1
strip = true
```

The app is one `egui::CentralPanel` with a `text_edit_singleline` and a button,
mounted through the embed entry point under test:

```rust
eframe::WebRunner::new()
    .start(canvas, eframe::WebOptions::default(),
           Box::new(|_cc| Ok(Box::new(SpikeApp { text: String::new() }))))
    .await
```

`eframe` resolved to **0.36.2**, the same version the parent research doc cites
(`docs/meta/research/egui-frontend-adoption.md` §2.1).

### 1.4 Definitions used by the tables

- **cold** — `CARGO_TARGET_DIR` removed first, so every dependency is compiled
  from source. The crates.io registry cache in `~/.cargo/registry` was already
  warm from a previous build, so these are *cold-compile* numbers, not
  *cold-plus-network-download* numbers.
- **warm** — `touch src/lib.rs` and rebuild against the same target dir, so only
  the spike crate itself recompiles. This is what an incremental build loop
  actually pays.
- **bundle bytes** — the emitted `.wasm`, the only artifact `cargo` produces. The
  `wasm-bindgen` glue (`.js`) is **not measured**; generating it needs the
  `wasm-bindgen` CLI, which is not installed. `wasm-opt` is also absent, so
  these are **unoptimized-by-wasm-opt** sizes.

### 1.5 Not measured

Stated plainly so nothing here reads as a claim it is not:

- Browser runtime behaviour of the mount (no browser harness on this host).
  §5 is source-reasoned, not observed.
- The `wasm-bindgen` JS glue size.
- `wasm-opt`-optimized `.wasm` size.
- A `cargo audit` verdict. `cargo-audit` is not installed and installing tools
  was out of scope; §4 substitutes an explicit, weaker measurement and says so.
- Build time for `native/loop-lore-native` itself, so no "×N slower than our
  current Rust build" ratio is asserted.

---

## 2. Measurement table — `glow` vs `wgpu`

Both rows are `--release --target wasm32-unknown-unknown`, `lto = "thin"`,
`codegen-units = 1`, `strip = true`, on the same 32-thread host.

### 2.1 On the pinned toolchain, `rustc 1.97.1` (headline numbers)

| Metric | `glow` | `wgpu` | `wgpu` / `glow` |
| ------ | -----: | -----: | -------------: |
| Cold build wall time | **93 s** | **143 s** | 1.54× |
| Warm (spike crate only) wall time | **18 s** | **42 s** | 2.33× |
| `.wasm` raw bytes | **5,896,841** | **9,746,021** | 1.65× |
| `.wasm` brotli `-q 11` bytes | **1,589,840** | **2,302,489** | 1.45× |
| `.wasm` gzip `-9` bytes | **2,060,106** | **3,147,414** | 1.53× |
| `cargo tree` third-party crates | **88** | **110** | 1.25× |

### 2.2 Cross-check on the system toolchain, `rustc 1.99.0`

| Metric | `glow` | `wgpu` |
| ------ | -----: | -----: |
| Cold build wall time | 84 s | 126 s |
| Warm wall time | 17 s | 31 s |
| `.wasm` raw bytes | 5,923,366 | 9,719,778 |
| `.wasm` brotli `-q 11` bytes | 1,604,026 | 2,316,879 |
| `.wasm` gzip `-9` bytes | 2,070,462 | 3,152,633 |

Both toolchains compile `eframe` 0.36.2 cleanly for `wasm32-unknown-unknown`
with either backend. `eframe` 0.36.2 declares `edition = "2024"` and
`rust-version = "1.95"` (published `eframe-0.36.2/Cargo.toml:13-14`), which the
repo's pinned **1.97.1** satisfies with margin.

### 2.3 Build commands (verbatim)

Cold, `glow`, pinned toolchain:

```
export PATH=<worktree>/.tmp/rust197/bin:$PATH
export CARGO_TARGET_DIR=<worktree>/.tmp/target197-glow
rm -rf "$CARGO_TARGET_DIR"
cargo build --release --target wasm32-unknown-unknown --no-default-features \
  --features glow --manifest-path <worktree>/.tmp/egui-spike/Cargo.toml
```

Warm, `glow`, pinned toolchain (same command, after `touch src/lib.rs`):

```
touch <worktree>/.tmp/egui-spike/src/lib.rs
cargo build --release --target wasm32-unknown-unknown --no-default-features \
  --features glow --manifest-path <worktree>/.tmp/egui-spike/Cargo.toml
```

`wgpu` is identical with `--features wgpu` and
`CARGO_TARGET_DIR=<worktree>/.tmp/target197-wgpu`. Wall time was taken as
`date +%s` deltas around each invocation.

Byte measurement:

```
stat -c 'wasm_raw=%s' <worktree>/.tmp/target197-<backend>/wasm32-unknown-unknown/release/egui_wasm_spike.wasm
brotli -f -q 11 -c <wasm> > <out>.br && stat -c '%s' <out>.br
gzip  -9          -c <wasm> > <out>.gz && stat -c '%s' <out>.gz
```

Dependency counts:

```
cargo tree --prefix none --target wasm32-unknown-unknown \
  --no-default-features --features <glow|wgpu> \
  --manifest-path <worktree>/.tmp/egui-spike/Cargo.toml
```

### 2.4 Reading the numbers

- **The bundle did not get cheap.** A *minimal* app — one panel, one text field,
  one button — costs 5.9 MB raw / **1.59 MB brotli** (`glow`) or 9.7 MB raw /
  **2.30 MB brotli** (`wgpu`). For scale in the same worktree:
  `src/views/admin.html` is 157,755 bytes raw and `src/public/locales/en.json`
  is 65,919 bytes. The `glow` brotli figure is ~10× the largest
  template (14.6× for `wgpu`) and ~24× the largest locale bundle, before a
  single product screen exists.
- This is consistent with the maintainers' own demo figures (5.9 MiB glow vs
  8.3 MiB wgpu, uncompressed, [emilk/egui#5889](https://github.com/emilk/egui/issues/5889)).
  Those are MiB against the MB used here and a different app, so treat this as
  order-of-magnitude corroboration, not a reproduction.
- **`glow` is worth switching to**, and the parent doc's claim that it is the
  size-reducing choice holds: −39% raw, −31% brotli, −35% cold build seconds.
  `wgpu` remains `eframe`'s default feature
  (`eframe-0.36.2/Cargo.toml:60-69`), so "use the default" means paying the
  bigger number unless the default is turned off explicitly.
- **Build time is a non-issue for this repo.** 93 s and 143 s of a 32-thread
  cold build are smaller than a single full check-and-test cycle. Nobody should
  block an egui decision on compile time.

---

## 3. Toolchain cost on top of the existing crate

Baseline: `native/loop-lore-native` (feature-gated `blake3` / `zstd` / `gguf`,
`cdylib` + `rlib`).

| | `native/loop-lore-native` | spike `glow` | spike `wgpu` |
| --- | ---: | ---: | ---: |
| `cargo tree` lines | 18 | 171 | 288 |
| **unique third-party crates** | **15** | **88** | **110** |
| Marginal vs baseline | — | **+73** | **+95** |
| `Cargo.lock` unique crates | 18 | 284 (union of both backends) | 284 |

The marginal cost is real but it is **not** a blocker, and it is not
proportional to the bundle-size cost: roughly 6× the dependency count costs
~1.5× the build seconds and ~1.6× the bundle bytes. The bundle is the expensive
half of this story; the dependency graph is the cheap half.

What `eframe` pulls in beyond the existing crate, by category (from the measured
`cargo tree`, `wasm32-unknown-unknown`): the renderer itself (`glow` +
`egui_glow`, or `wgpu` + `egui-wgpu` + `naga`), font shaping
(`epaint_default_fonts`, `harfrust`, `read-fonts`, `skrifa`), text layout
(`unicode-*`, `vello_cpu`, `euclid`), `image` + `png` + `flate2`/`miniz_oxide`,
the `wasm-bindgen`/`js-sys`/`web-sys` triad, `bytemuck`, `ahash`, `uuid`, and —
notably — `accesskit`, which lands in the tree even with
`default-features = false` because `egui-winit` remains a dependency of
`eframe`.

One API-drift note for whoever picks this up later: `eframe::App` 0.36 **no
longer has `update`**. It is `fn ui(&mut self, ui: &mut egui::Ui, frame: &mut
eframe::Frame)` (`eframe-0.36.2/src/epi.rs:182`). Every tutorial written before
0.36 will not compile.

---

## 4. `cargo audit`-style dependency surface — measured, weaker than `cargo audit`

**`cargo audit` is not installed on this host and installing it was out of
scope.** The RustSec advisory database, however, *is* reachable, so this section
measures the **surface** `cargo audit` would have to resolve rather than a
verdict.

```
git clone --depth 1 https://github.com/rustsec/advisory-db   # HEAD 6aed84668c23d7f535077a9fe918bf1fa0f6a5bc
```

That clone holds **1,290 advisories**. Matching every crate name in each
`Cargo.lock` against the advisory DB by name:

| | crates in `Cargo.lock` | crates with ≥1 advisory **of any version** |
| --- | ---: | ---: |
| `native/loop-lore-native` | 18 | **2** — `arrayref`, `shlex` |
| egui spike (both backends) | 284 | **23** |

The 23: `ash`, `bumpalo`, `bytes`, `crossbeam-utils`, `futures-task`,
`futures-util`, `hashbrown`, `image`, `lock_api`, `memmap2`, `once_cell`,
`ordered-float`, `quick-xml`, `self_cell`, `shlex`, `slab`, `smallvec`, `tokio`,
`tracing`, `windows`, `xml-rs`, `zerocopy`, `zlib-rs`.

**What this does and does not mean.** This is a *name-level* match. It does not
evaluate the semver ranges in `[versions] patched = [...]`, so it cannot say
whether any of the 23 is actually vulnerable at the resolved version — only
that a real `cargo audit` would have 21 more crates to reason about than the 2
it has today. Resolving those ranges requires `cargo audit`, which was not run.

Two things worth stating plainly:

- **The repo's Rust baseline is already non-zero on this axis** (2 crates with
  advisories of record), so `eframe` widens an existing surface rather than
  introducing a new class of problem. CI already runs
  `rustsec/audit-check@v2` (`.github/workflows/audit.yml:35-46`), and that job
  audits the workspace — adding an `eframe` crate to the workspace is exactly
  the kind of change that would silently widen what that job covers. **The
  spike deliberately did not add a second crate to the workspace** (ticket Out
  of Scope), so CI is unchanged.
- If `eframe` were ever adopted, the honest cost line is **+73 to +95 crates to
  resolve on every `audit-check` run**, not a number of new vulnerabilities.

---

## 5. DOM-interop verdict

Question asked by the ticket: can an egui canvas and the server-rendered htmx +
Alpine DOM coexist in one document without either fighting for focus or input?

**Answer: they can be made to coexist in the DOM sense, but they cannot coexist
in the *focus and lifecycle* sense without explicit scaffolding, and the
scaffolding would have to be rebuilt on every htmx swap.** Facts first, then the
inference they support.

Sources for this section, all at `emilk/egui@b25d2d45`, read 2026-10-14, plus
the vendored htmx in this worktree (`htmx.org@2.0.11`,
`node_modules/htmx.org/dist/htmx.js`).

### 5.1 Facts (code and docs, cited)

**F1 — The embed entry point exists and takes your canvas, and mutates it.**
`crates/eframe/src/web/web_runner.rs:59-72`:

```rust
canvas: web_sys::HtmlCanvasElement,
web_options: crate::WebOptions,
app_creator: epi::AppCreator<'static>,
) -> Result<(), JsValue> {
    // Make sure the canvas can be given focus.
    canvas.set_tab_index(0);
    // Don't outline the canvas when it has focus:
    canvas.style().set_property("outline", "none")?;
```

Measured: `WebRunner::start` with a caller-supplied canvas compiles and links
for `wasm32-unknown-unknown` with both backends (§2). The parent research doc's
§2.2 claim of technical mountability is **confirmed**, not merely inferred.

**F2 — But mounting it writes into your page.** `WebRunner::start` immediately
calls `TextAgent::attach(self, &canvas)` (`web_runner.rs:77`).
`TextAgent::attach` (`crates/eframe/src/web/text_agent.rs:18-70`) creates a
**real DOM element**:

```rust
let input = document.create_element("input")?.dyn_into::<web_sys::HtmlInputElement>()?;
input.set_type("text");
…
style.set_property("opacity", "0")?;            // text_agent.rs:39
style.set_property("pointer-events", "none")?;  // text_agent.rs:40
…
if let Some(parent) = canvas.parent_node() {
    parent.insert_before(&input, canvas.next_sibling().as_ref())?; // text_agent.rs:58-59
} else if let Some(body) = document.body() {
    body.append_child(&input)?;                                    // text_agent.rs:60-63
}
// Focus the app on startup, without scrolling the page.
super::focus_without_scroll(&input).ok();                          // text_agent.rs:65-70
```

So mounting an egui canvas into an htmx page **inserts one hidden `<input>`
as a sibling of the canvas and focuses it, at startup, unconditionally**.

**F3 — Focus is owned by that hidden input for the app's whole life.**
`text_agent.rs:137-172`: `set_focus(on)` calls `focus_without_scroll(&self.input)`
on `true` and `self.input.blur()` on `false`; `has_focus()` is
`super::has_focus(&self.input)` (`:145-147`). `focus_without_scroll` is
`crates/eframe/src/web/mod.rs:89-97` — a real
`element.focus_with_options({preventScroll: true})`.

**F4 — Keyboard and IME events are delivered to that input, not the canvas.**
`TextAgent::attach` registers its `composition*` and key listeners against
`&input` (`text_agent.rs:74+`, via `WebRunner::add_event_listener`,
`web_runner.rs:172-215`).

**F5 — The animation loop is self-perpetuating and node-unaware.**
`web_runner.rs:243-281` reschedules `request_animation_frame` each frame, with a
`document.hidden` → `setTimeout(…, ~1000)` fallback at `:261-269`. There is no
`document.contains(canvas)` / connectivity check anywhere in that path. A
`ResizeObserver` is left observing the canvas node at `web_runner.rs:87`.

**F6 — Upstream's own words, unchanged.** `crates/eframe/README.md:37-49`,
"Limitations when running egui on the web": egui "compiles to Wasm using either
WebGPU (when available) or WebGL2 for rendering, and almost nothing else from
the web tech stack"; "you cannot search an egui web page like you would a normal
web page"; and — the line that matters most here — "Bringing up an on-screen
keyboard on mobile: there is no JS function to do this, so `eframe` fakes it by
adding some invisible DOM elements. It doesn't always work." That last sentence
is upstream acknowledging F2 in its own words.

**F7 — The htmx side.** `node_modules/htmx.org/dist/htmx.js:100` sets
`defaultSwapStyle: 'innerHTML'`; `:1838-1842` routes to `swapInnerHTML`; and
`swapInnerHTML` (`:1774-1785`) does:

```js
const firstChild = target.firstChild
insertNodesBefore(target, firstChild, fragment, settleInfo)
if (firstChild) {
  while (firstChild.nextSibling) { cleanUpElement(firstChild.nextSibling); target.removeChild(firstChild.nextSibling) }
  cleanUpElement(firstChild)
  target.removeChild(firstChild)
}
```

A default htmx swap **hard-removes the previous children** of the swap target.
Nothing in that path notifies a WASM module holding a reference to one of them.

### 5.2 Inferences (labelled — not upstream statements, not observed at runtime)

None of the following were observed in a browser; this host has no browser
harness. Each is a reading of F1–F7.

**I1 — Startup focus theft is the default outcome, not an edge case.** Because
`TextAgent::attach` focuses its hidden input at startup without a click
(text_agent.rs:65-70), loading a page that contains an egui canvas moves DOM
focus off whatever the user was in. In this repo that matters concretely: the
chat view is an Alpine-managed `<input>`, and mounting a canvas on a page that
also renders one would blur it on load. `focus_without_scroll` prevents the
*scroll* side effect; it does nothing about the focus side effect.

**I2 — While egui is unfocused, page inputs are fine; the moment it is focused,
the two are mutually exclusive.** F3+F4 mean the canvas island's entire input
surface is one hidden `<input>`. It has `pointer-events: none`, so it does not
intercept clicks meant for the page, and its listeners are on the input, so an
Alpine input the user is typing into keeps working — *until* egui takes focus,
at which point there is exactly one focused element in the document and it is
egui's. Coexistence is not "two live input surfaces"; it is "one focused input
surface at a time, and the canvas takes it whenever the app asks".

**I3 — An htmx swap of the surrounding subtree strands the canvas.** F7 removes
the canvas and its hidden input via `removeChild`; F5 means the Rust side never
learns. After such a swap the app is running but invisible: the `rAF` loop keeps
scheduling frames against a detached node, the `ResizeObserver` keeps observing
it, and nothing repaints. There is no re-attach in the API surface measured
here — the only recovery is calling `WebRunner::start` again on a fresh canvas
element, which means re-instantiating the whole app. In a repo whose entire view
model is "the server re-renders a fragment and the browser replaces a subtree",
this is not a rare edge; it is the normal lifecycle event. **Escaping it would
require pinning the canvas *outside* every swap target** — which forfeits
exactly the "embed it in the page" property the spike was asked to test.

**I4 — Text input coexistence is possible, but only across a JS bridge.** egui
reads keystrokes from an input it owns (F4) and stores the value in WASM memory
(`SpikeApp.text`). Reading or writing that value from the page requires a
`wasm_bindgen` extern or a JS bridge; every state handoff crosses the boundary.
This does not contradict the parent research doc's "no DOM interop" framing —
that claim is about the *emit* surface (`egui::FullOutput` carries no markup,
docs.rs, cited there), which this spike neither refutes nor extends. It does
sharpen it: eframe's one DOM write is not a rendering path, it is its own input.

### 5.3 Verdict

> **The DOM-interop answer is "no, not without scaffolding that the htmx
> lifecycle will keep tearing down."** Mounting works (F1). Mounting also
> focuses a hidden input on startup (F2, I1), owns the document's single focus
> slot while the app is active (F3, I2), and is silently killed by the first
> htmx swap of its container (F5, F7, I3).

This is *stronger and more specific* than the parent doc's inference, and it
points the same way. The parent doc said an egui embed is a canvas island with
no DOM interop; this spike can now name the three mechanics.

---

## 6. Does the parent research doc's recommendation change?

**No. It is confirmed, and the "still no" is now backed by numbers.**

| Parent doc's open question 3 | Measured answer |
| --------------------------- | --------------- |
| "What does `eframe` with the default `wgpu` backend cost in compile time and in `cargo audit` surface on top of `native/loop-lore-native`?" | Compile time: **143 s** cold / **42 s** warm for `wgpu`, **93 s** / **18 s** for `glow` — small. Dependency surface: **+95** crates for `wgpu`, **+73** for `glow`, against 15 today. Advisory surface: **23** crates with advisories of record vs **2** today (name-level, not range-resolved). |

**What the measurements change:** almost nothing about the decision, which is
the point. The three things the spike set out to price turned out to be the
*cheap* parts — 1.6–2.3 MB brotli for a one-screen app is the expensive part,
and it is not an order of magnitude different from the demo figure the parent
doc already had, so the number that mattered was never in doubt. Compile time
and audit surface, the two things flagged as unknown, are both immaterial.

**What the measurements add:** a DOM verdict that is no longer an inference
from a README sentence but three named mechanics with `path:line` citations
(§5), including one the parent doc could not have had — that eframe writes
*into* the page, one hidden `<input>` as a canvas sibling, and focuses it at
startup.

**Verdict: do not adopt egui as a loop-lore frontend, in any of its three
shapes, in the near term.** Adopt (c), the client-agnostic view-model layer;
keep (d), the TUI (blessed at the time of writing; pi-tui migration in progress), as the reference non-web client. The
`TASK-egui-wasm-embed-spike.md` ticket is therefore **complete and negative**,
which is the outcome it was scoped to allow.

**If this is ever revisited**, the cheap ordering the parent doc already
implied is unchanged, and this spike sharpens it: land (c) first, then treat
any egui work as a *separate Rust crate outside the htmx swap lifecycle*
(a route that never swaps its own container, `glow` not `wgpu`, lazy-loaded
behind explicit opt-in), and budget ~1.6 MB brotli for the canvas plus a JS
bridge for every value that has to cross into the page.

---

## 7. Sources

| Claim | Source | Read |
| ----- | ------ | ---- |
| `eframe::App` uses `fn ui`, not `fn update`, in 0.36 | `eframe-0.36.2/src/epi.rs:182` | 2026-10-14 |
| `eframe` 0.36.2 is `edition = "2024"`, `rust-version = "1.95"` | published `eframe-0.36.2/Cargo.toml:13-14` | 2026-10-14 |
| `eframe` default features include `wgpu`; `glow`/`wgpu` feature names | published `eframe-0.36.2/Cargo.toml:60-69`, `:71-76`, `:99-107` | 2026-10-14 |
| Web limitations wording, incl. the "invisible DOM elements" line | <https://github.com/emilk/egui/blob/b25d2d45/crates/eframe/README.md> §"Limitations when running egui on the web" (`:37-49`) | 2026-10-14 |
| Exactly one of `glow`/`wgpu` required | `emilk/egui@b25d2d45` `crates/eframe/src/web/mod.rs:29-30` | 2026-10-14 |
| `focus_without_scroll` = `focus({preventScroll:true})` | `emilk/egui@b25d2d45` `crates/eframe/src/web/mod.rs:89-97` | 2026-10-14 |
| `WebRunner::start` sets `tab_index(0)`, clears `outline`, attaches `TextAgent`, observes resize | `emilk/egui@b25d2d45` `crates/eframe/src/web/web_runner.rs:59-89` | 2026-10-14 |
| Hidden `<input>` sibling + startup focus | `emilk/egui@b25d2d45` `crates/eframe/src/web/text_agent.rs:18-70` | 2026-10-14 |
| `set_focus` / `focus` / `blur` target that input | `emilk/egui@b25d2d45` `crates/eframe/src/web/text_agent.rs:137-172` | 2026-10-14 |
| Self-perpetuating `request_animation_frame`, no connectivity check | `emilk/egui@b25d2d45` `crates/eframe/src/web/web_runner.rs:243-281` | 2026-10-14 |
| htmx default swap removes prior children | `node_modules/htmx.org/dist/htmx.js` (`htmx.org@2.0.11`) `:100`, `:1774-1785`, `:1838-1842` | 2026-10-14 |
| Maintainer demo sizes, glow vs wgpu | [emilk/egui#5889](https://github.com/emilk/egui/issues/5889) | cited from parent doc, not re-read |
| Embedded-in-scrollable-page focus issue | [emilk/egui#8295](https://github.com/emilk/egui/issues/8295) (cited in `text_agent.rs:69`) | 2026-10-14 |
| RustSec advisory DB contents | `rustsec/advisory-db` @ `6aed84668c23d7f535077a9fe918bf1fa0f6a5bc`, 1,290 advisories | 2026-10-14 |
| Rust 1.97.1 + wasm32 std artifacts | <https://static.rust-lang.org/dist/2026-07-16/> | 2026-10-14 |
| Repo Rust baseline | `native/loop-lore-native/rust-toolchain.toml:4`, `Cargo.toml:13-29` | 2026-10-14 |