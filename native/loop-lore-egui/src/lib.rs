//! # loop-lore-egui
//!
//! Experimental egui (Rust) frontend for loop-lore, compiled to
//! `wasm32-unknown-unknown` and mounted into the `/egui` host page.
//!
//! This crate is the **second client shape** the egui epic deferred: a canvas
//! app that talks to the server over JSON only — it never receives, parses, or
//! emits an htmx fragment. Its data comes from the same `/api/v1` endpoints
//! the TUI uses; its transfer context lives in the browser (`localStorage`)
//! under the key declared in [`context::CONTEXT_STORAGE_KEY`], shared with the
//! htmx/Alpine frontend via `src/frontend/egui-bridge.ts`.
//!
//! Deliberately outside every htmx swap target (spike finding I3): the canvas
//! is mounted on `/egui`, a page that never swaps its own container.

// Host builds (`cargo test`, `bun run lint:egui`) never mount the app, so the
// wasm-only modules' host twins are unreachable by design and expected dead
// code there. The wasm build (`bun run build:egui`) carries the real
// reachability set.
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

mod api;
mod client;
mod context;
mod emoji;
mod storage;
mod stream;

#[cfg(target_arch = "wasm32")]
mod app;
#[cfg(target_arch = "wasm32")]
mod web;

pub use api::{ChatMessage, ChatSummary};
#[cfg(target_arch = "wasm32")]
pub use app::EguiApp;
pub use context::FrontendContext;
