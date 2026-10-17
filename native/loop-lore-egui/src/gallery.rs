// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

//! Gallery grid state: asset rows, paging, and the texture seam.
//!
//! The grid consumes the JSON view-model (`GET /dynamic/gallery/grid` with
//! `Accept: application/json`)//! through [`crate::api`] — the same rows the htmx
//! fragment renders. Thumbnails are requested from the bridge
//! (`src/frontend/egui-gallery.ts`, global `window.loopLoreEguiGallery`), which
//! fetches the bytes, decodes them in the browser, and calls back into Rust.
//!
//! The state machine ([`GalleryState`]) is pure and host-tested; the queue is
//! host-testable; only the `#[wasm_bindgen]` exports are wasm-gated.

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use crate::api::GalleryAsset;

/// One thumbnail request, enqueued until the bridge resolves it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThumbRequest {
  /// Asset id the thumbnail belongs to.
  pub asset_id: String,
  /// Thumbnail URL from the view-model.
  pub url: String,
}

/// A resolved thumbnail: raw RGBA pixels and dimensions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThumbPixels {
  /// Asset id the thumbnail belongs to.
  pub asset_id: String,
  /// Pixel width.
  pub width: u32,
  /// Pixel height.
  pub height: u32,
  /// RGBA bytes, `width * height * 4`.
  pub rgba: Vec<u8>,
}

/// One gallery cell: the asset plus its thumbnail state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GalleryCell {
  /// The asset row.
  pub asset: GalleryAsset,
  /// `true` when the thumbnail has been requested from the bridge.
  pub thumb_requested: bool,
  /// Resolved thumbnail pixels, when the bridge delivered them.
  pub thumb: Option<ThumbPixels>,
  /// `true` when the thumbnail fetch or decode failed; renders a placeholder.
  pub thumb_failed: bool,
}

impl GalleryCell {
  fn new(asset: GalleryAsset) -> Self {
    Self {
      asset,
      thumb_requested: false,
      thumb: None,
      thumb_failed: false,
    }
  }
}

/// The gallery grid state: rows, paging, and the texture seam.
///
/// Single source of truth for the egui gallery surface. Pure — no `await`, no
/// I/O; fetches are spawned by the app and their results are pushed in.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct GalleryState {
  /// Asset rows in display order (page-concatenated).
  pub cells: Vec<GalleryCell>,
  /// Current 1-based page.
  pub page: u32,
  /// Query filter (mirrors the htmx search input).
  pub query: String,
  /// `true` while a page fetch is in flight.
  pub loading: bool,
  /// One-line error surfaced to the status bar.
  pub error: Option<String>,
  /// `true` when a full page came back (more likely available).
  pub has_more: bool,
  /// Pending thumbnail requests, drained each frame.
  pending_thumbs: Vec<ThumbRequest>,
  /// Resolved thumbnails, drained each frame.
  ready_thumbs: Vec<ThumbPixels>,
}

impl GalleryState {
  /// Reset to page 1 with an empty query (the initial state).
  pub fn new() -> Self {
    Self::default()
  }

  /// Merge a fetched page into the grid. `replace` = first page (clears rows).
  ///
  /// # Panics
  ///
  /// Never — `page` is clamped to >= 1.
  pub fn apply_page(&mut self, assets: Vec<GalleryAsset>, page: u32, replace: bool) {
    self.page = page.max(1);
    self.loading = false;
    self.error = None;
    if replace {
      self.cells.clear();
      // A new query invalidates any pending thumbnails.
      self.pending_thumbs.clear();
    }
    self.has_more = assets.len() >= crate::api::GALLERY_PAGE_SIZE as usize;
    for asset in assets {
      self.cells.push(GalleryCell::new(asset));
    }
  }

  /// Record a page fetch failure.
  pub fn apply_error(&mut self, message: String) {
    self.loading = false;
    self.error = Some(message);
  }

  /// Set the query and reset paging (a new search starts at page 1).
  pub fn set_query(&mut self, query: String) {
    self.query = query;
    self.page = 1;
    self.cells.clear();
    self.error = None;
    self.has_more = false;
  }

  /// Enqueue a thumbnail request for `asset_id` if not already requested.
  pub fn request_thumb(&mut self, asset_id: String, url: String) {
    if self
      .cells
      .iter()
      .any(|c| c.asset.id == asset_id && (c.thumb_requested || c.thumb.is_some()))
    {
      return;
    }
    self.pending_thumbs.push(ThumbRequest { asset_id, url });
  }

  /// Drain pending thumbnail requests, in FIFO order. Marks each drained
  /// cell as requested so the next `enqueue_missing_thumbs` skips it.
  pub fn drain_pending_thumbs(&mut self) -> Vec<ThumbRequest> {
    let drained: Vec<ThumbRequest> = self.pending_thumbs.drain(..).collect();
    for request in &drained {
      if let Some(cell) = self.cells.iter_mut().find(|c| c.asset.id == request.asset_id) {
        cell.thumb_requested = true;
      }
    }
    drained
  }

  /// Deliver a resolved thumbnail to its cell.
  pub fn apply_thumb(&mut self, pixels: ThumbPixels) {
    if let Some(cell) = self.cells.iter_mut().find(|c| c.asset.id == pixels.asset_id) {
      cell.thumb_requested = false;
      cell.thumb_failed = false;
      cell.thumb = Some(pixels);
    }
  }

  /// Mark a thumbnail fetch as failed (placeholder tile).
  pub fn apply_thumb_failed(&mut self, asset_id: String) {
    if let Some(cell) = self.cells.iter_mut().find(|c| c.asset.id == asset_id) {
      cell.thumb_requested = false;
      cell.thumb_failed = true;
    }
  }

  /// Enqueue thumbnails for every image cell lacking one (called each frame).
  pub fn enqueue_missing_thumbs(&mut self) {
    let requests: Vec<(String, String)> = self
      .cells
      .iter()
      .filter(|c| !c.thumb_requested && c.thumb.is_none() && !c.thumb_failed)
      .filter_map(|c| {
        c.asset
          .thumb_url
          .clone()
          .map(|url| (c.asset.id.clone(), url))
      })
      .collect();
    for (asset_id, url) in requests {
      self.request_thumb(asset_id, url);
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge seam (wasm-gated)
// ---------------------------------------------------------------------------

thread_local! {
  static PENDING: std::cell::RefCell<Vec<ThumbRequest>> = const { std::cell::RefCell::new(Vec::new()) };
  static READY: std::cell::RefCell<Vec<ThumbPixels>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Queue one thumbnail request for the bridge.
pub fn push_thumb_request(request: ThumbRequest) {
  PENDING.with(|q| q.borrow_mut().push(request));
}

/// Drain queued thumbnail requests for the bridge to fulfill.
pub fn drain_thumb_requests() -> Vec<ThumbRequest> {
  PENDING.with(|q| q.borrow_mut().drain(..).collect())
}

/// Queue a resolved thumbnail for the app to pick up.
pub fn push_thumb_ready(pixels: ThumbPixels) {
  READY.with(|q| q.borrow_mut().push(pixels));
}

/// Drain resolved thumbnails for the app.
pub fn drain_thumb_ready() -> Vec<ThumbPixels> {
  READY.with(|q| q.borrow_mut().drain(..).collect())
}

/// Queue a thumbnail failure for the app.
#[cfg(target_arch = "wasm32")]
pub fn push_thumb_failed(asset_id: String) {
  FAILED.with(|q| q.borrow_mut().push(asset_id));
}

#[cfg(target_arch = "wasm32")]
thread_local! {
  static FAILED: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Drain thumbnail failures for the app.
#[cfg(target_arch = "wasm32")]
pub fn drain_thumb_failed() -> Vec<String> {
  FAILED.with(|q| q.borrow_mut().drain(..).collect())
}

/// Bridge function the wasm app imports; `src/frontend/egui-gallery.ts` defines
/// the global when the bridge bundle initializes.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
  /// Ask the bridge to fetch and decode the thumbnail at `url` for `asset_id`.
  #[wasm_bindgen(js_name = requestThumbnail)]
  fn js_request_thumbnail(asset_id: &str, url: &str);

  /// Ask the bridge to open the file picker and POST the chosen file.
  #[wasm_bindgen(js_name = uploadAsset)]
  fn js_upload_asset();

  /// Ask the bridge to POST an attach link for `asset_id` to `chat_id`.
  #[wasm_bindgen(js_name = attachAsset)]
  fn js_attach_asset(asset_id: &str, chat_id: &str);
}

/// Ask the bridge to fetch the thumbnail for `asset_id` at `url`.
#[cfg(target_arch = "wasm32")]
pub fn request_thumbnail(asset_id: &str, url: &str) {
  js_request_thumbnail(asset_id, url);
}

/// Ask the bridge to open the file picker and upload.
#[cfg(target_arch = "wasm32")]
pub fn upload_asset() {
  js_upload_asset();
}

/// Ask the bridge to attach `asset_id` to `chat_id`.
#[cfg(target_arch = "wasm32")]
pub fn attach_asset(asset_id: &str, chat_id: &str) {
  js_attach_asset(asset_id, chat_id);
}

/// Sink export: the bridge delivers resolved thumbnail pixels.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_thumb_ready(asset_id: &str, width: u32, height: u32, rgba: Vec<u8>) {
  push_thumb_ready(ThumbPixels {
    asset_id: asset_id.to_string(),
    width,
    height,
    rgba,
  });
}

/// Sink export: the bridge reports a thumbnail failure.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_thumb_failed(asset_id: &str) {
  push_thumb_failed(asset_id.to_string());
}

/// Sink export: the bridge reports an upload finished (asset id, or empty).
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_asset_uploaded(asset_id: &str) {
  UPLOADED.with(|q| q.borrow_mut().push(asset_id.to_string()));
}

/// Sink export: the bridge reports an attach result.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_attach_result(asset_id: &str, ok: bool) {
  ATTACH_RESULTS.with(|q| q.borrow_mut().push((asset_id.to_string(), ok,)),);
}

#[cfg(target_arch = "wasm32")]
thread_local! {
  static ATTACH_RESULTS: std::cell::RefCell<Vec<(String, bool,)>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Drain attach results for the app.
#[cfg(target_arch = "wasm32")]
pub fn drain_attach_results() -> Vec<(String, bool,)> {
  ATTACH_RESULTS.with(|q| q.borrow_mut().drain(..).collect())
}

#[cfg(target_arch = "wasm32")]
thread_local! {
  static UPLOADED: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Drain finished upload asset ids.
#[cfg(target_arch = "wasm32")]
pub fn drain_uploaded() -> Vec<String> {
  UPLOADED.with(|q| q.borrow_mut().drain(..).collect())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::api::GalleryAsset;

  fn asset(id: &str, asset_type: &str, thumb: Option<&str>) -> GalleryAsset {
    GalleryAsset {
      id: id.to_string(),
      filename: format!("{id}.png"),
      asset_type: asset_type.to_string(),
      size_bytes: 1024,
      size_label: "1.0 KB".to_string(),
      thumb_url: thumb.map(String::from),
      tags: vec![],
      visibility: "public".to_string(),
      created_at: "2026-10-01".to_string(),
    }
  }

  #[test]
  fn apply_page_replaces_on_first_page_and_appends_after() {
    let mut state = GalleryState::new();
    state.apply_page(
      vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))],
      1,
      true,
    );
    assert_eq!(state.cells.len(), 1);
    assert_eq!(state.page, 1);
    state.apply_page(vec![asset("a2", "image", None)], 2, false);
    assert_eq!(state.cells.len(), 2);
    assert_eq!(state.page, 2);
  }

  #[test]
  fn apply_page_marks_has_more_on_full_page() {
    let mut state = GalleryState::new();
    let full = (0..crate::api::GALLERY_PAGE_SIZE)
      .map(|i| asset(&format!("a{i}"), "image", None))
      .collect();
    state.apply_page(full, 1, true);
    assert!(state.has_more);
    let mut state2 = GalleryState::new();
    state2.apply_page(vec![asset("a1", "image", None)], 1, true);
    assert!(!state2.has_more);
  }

  #[test]
  fn set_query_resets_grid() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", None)], 1, true);
    state.set_query("cat".to_string());
    assert_eq!(state.query, "cat");
    assert_eq!(state.cells.len(), 0);
    assert_eq!(state.page, 1);
  }

  #[test]
  fn thumb_request_dedupes_and_drains_fifo() {
    let mut state = GalleryState::new();
    state.apply_page(
      vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))],
      1,
      true,
    );
    state.enqueue_missing_thumbs();
    let first = state.drain_pending_thumbs();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].asset_id, "a1");
    // Second enqueue is a no-op: the request is already pending.
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 0);
  }

  #[test]
  fn thumb_ready_and_failed_mark_cells() {
    let mut state = GalleryState::new();
    state.apply_page(
      vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))],
      1,
      true,
    );
    state.enqueue_missing_thumbs();
    state.drain_pending_thumbs();
    state.apply_thumb(ThumbPixels {
      asset_id: "a1".to_string(),
      width: 4,
      height: 4,
      rgba: vec![0; 64],
    });
    assert_eq!(state.cells[0].thumb.as_ref().unwrap().width, 4);
    assert!(!state.cells[0].thumb_failed);
    state.apply_thumb_failed("a1".to_string());
    assert!(state.cells[0].thumb_failed);
  }

  #[test]
  fn non_image_cells_never_request_thumbs() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "audio", None)], 1, true);
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 0);
  }
}
