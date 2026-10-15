//! Browser storage access for the transfer context.
//!
//! The egui app and the htmx/Alpine frontend share these values: both read
//! and write the same `localStorage` key and the same CSRF cookie (the
//! contract is mirrored in `src/frontend/egui-bridge.ts`).

use crate::context::FrontendContext;

/// The canvas element the htmx page hosts.
pub const CANVAS_ID: &str = "egui-canvas";

/// The non-HttpOnly CSRF cookie name (see `src/middleware/csrf.ts`).
const CSRF_COOKIE_NAME: &str = "csrf_token";

/// Load the stored transfer context, or the default when absent/invalid.
#[cfg(target_arch = "wasm32")]
pub fn load_context() -> FrontendContext {
  imp::local_storage()
    .and_then(|storage| storage.get_item(&crate::context::CONTEXT_STORAGE_KEY).ok().flatten())
    .as_deref()
    .map(FrontendContext::from_stored_json)
    .unwrap_or_default()
}

/// Persist the transfer context.
#[cfg(target_arch = "wasm32")]
pub fn save_context(context: &FrontendContext) {
  if let Some(storage) = imp::local_storage() {
    let _ = storage.set_item(&crate::context::CONTEXT_STORAGE_KEY, &context.to_json());
  }
}

/// Read the CSRF double-submit cookie value, if present.
#[cfg(target_arch = "wasm32")]
pub fn csrf_cookie() -> Option<String> {
  let cookie = imp::cookie_string()?;
  cookie.split(';').find_map(|segment| {
    let (name, value) = segment.trim().split_once('=')?;
    (name == CSRF_COOKIE_NAME).then(|| value.trim().to_string())
  })
}

#[cfg(not(target_arch = "wasm32"))]
pub fn load_context() -> FrontendContext {
  FrontendContext::default()
}

#[cfg(not(target_arch = "wasm32"))]
pub fn save_context(_context: &FrontendContext) {}

#[cfg(not(target_arch = "wasm32"))]
pub fn csrf_cookie() -> Option<String> {
  None
}

/// Navigate the whole tab somewhere else — used for the htmx hand-back.
#[cfg(target_arch = "wasm32")]
pub fn assign_location(url: &str) {
  if let Some(window) = imp::window() {
    let _ = window.location().assign(url);
  }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn assign_location(_url: &str) {}

#[cfg(target_arch = "wasm32")]
mod imp {
  use web_sys::window;

  pub(super) fn window() -> Option<web_sys::Window> {
    window()
  }

  pub(super) fn local_storage() -> Option<web_sys::Storage> {
    window()?.local_storage().ok().flatten()
  }

  pub(super) fn cookie_string() -> Option<String> {
    window()?.document().cookie()
  }
}

// No host stub: host builds never touch web storage (see the cfg twins above).
