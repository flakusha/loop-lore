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

mod api;
mod client;
mod context;
mod storage;

#[cfg(target_arch = "wasm32")]
mod app;
#[cfg(target_arch = "wasm32")]
mod web;

pub use api::{ChatMessage, ChatSummary};
#[cfg(target_arch = "wasm32")]
pub use app::EguiApp;
pub use context::FrontendContext;
