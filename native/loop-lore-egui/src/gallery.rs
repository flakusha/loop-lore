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

use crate::api::{GalleryAsset, GalleryFilters};

/// Shorten a filename for a grid cell, appending `...` past `max_chars` chars.
///
/// Truncation is by `char`, not byte: filenames are user-controlled and a byte
/// slice at a fixed offset panics on any multi-byte character.
pub fn ellipsize(name: &str, max_chars: usize) -> String {
  if name.chars().count() <= max_chars {
    return name.to_string();
  }
  let head: String = name.chars().take(max_chars).collect();
  format!("{head}...")
}

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
  /// `true` once the bridge delivered pixels and the app cached a texture.
  /// The pixels themselves are not retained — the texture cache owns them.
  pub has_thumb: bool,
  /// `true` when the thumbnail fetch or decode failed; renders a placeholder.
  pub thumb_failed: bool,
}

impl GalleryCell {
  fn new(asset: GalleryAsset) -> Self {
    Self {
      asset,
      thumb_requested: false,
      has_thumb: false,
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
  /// Grid filters (mirror the htmx filter bar: `q`, `type`, `tag`, `sort`).
  pub filters: GalleryFilters,
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

  /// Set the filters and reset paging (a new search starts at page 1).
  pub fn set_filters(&mut self, filters: GalleryFilters) {
    self.filters = filters;
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
      .any(|c| c.asset.id == asset_id && (c.thumb_requested || c.has_thumb))
    {
      return;
    }
    self.pending_thumbs.push(ThumbRequest { asset_id, url });
  }

  /// Drain pending thumbnail requests, in FIFO order. Marks each drained
  /// cell as requested so the next `enqueue_missing_thumbs` skips it.
  pub fn drain_pending_thumbs(&mut self) -> Vec<ThumbRequest> {
    let drained = std::mem::take(&mut self.pending_thumbs);
    for request in &drained {
      if let Some(cell) = self.cells.iter_mut().find(|c| c.asset.id == request.asset_id) {
        cell.thumb_requested = true;
      }
    }
    drained
  }

  /// Record that a resolved thumbnail reached the texture cache.
  pub fn apply_thumb(&mut self, asset_id: &str) {
    if let Some(cell) = self.cells.iter_mut().find(|c| c.asset.id == asset_id) {
      cell.thumb_requested = false;
      cell.thumb_failed = false;
      cell.has_thumb = true;
    }
  }

  /// Mark a thumbnail fetch as failed (placeholder tile).
  ///
  /// A failure arriving after the cell already resolved is ignored: the bridge
  /// can deliver a late `eguiThumbFailed` for a superseded request, and flipping
  /// `thumb_failed` on a cell that has a texture would contradict the render.
  pub fn apply_thumb_failed(&mut self, asset_id: &str) {
    if let Some(cell) = self.cells.iter_mut().find(|c| c.asset.id == asset_id) {
      cell.thumb_requested = false;
      if !cell.has_thumb {
        cell.thumb_failed = true;
      }
    }
  }

  /// Enqueue thumbnails for every image cell lacking one (called each frame).
  pub fn enqueue_missing_thumbs(&mut self) {
    let requests: Vec<(String, String)> = self
      .cells
      .iter()
      .filter(|c| !c.thumb_requested && !c.has_thumb && !c.thumb_failed)
      .filter_map(|c| c.asset.thumb_url.clone().map(|url| (c.asset.id.clone(), url)))
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
  static READY: std::cell::RefCell<Vec<ThumbPixels>> = const { std::cell::RefCell::new(Vec::new()) };
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
  fn ellipsize_truncates_on_char_boundaries() {
    assert_eq!(ellipsize("short.png", 20), "short.png");
    assert_eq!(ellipsize("a.png", 5), "a.png");
    assert_eq!(ellipsize("abcdefghij", 4), "abcd...");
    // Every multi-byte char is 3+ bytes: a byte-indexed slice at 4 would panic.
    assert_eq!(ellipsize("日本語のファイル.png", 4), "日本語の...");
    assert_eq!(ellipsize("🎉🎉🎉🎉🎉", 2), "🎉🎉...");
  }

  #[test]
  fn apply_page_replaces_on_first_page_and_appends_after() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))], 1, true);
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
  fn set_filters_resets_grid() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", None)], 1, true);
    state.set_filters(GalleryFilters {
      query: "cat".to_string(),
      asset_type: "image".to_string(),
      ..GalleryFilters::default()
    });
    assert_eq!(state.filters.query, "cat");
    assert_eq!(state.filters.asset_type, "image");
    assert_eq!(state.cells.len(), 0);
    assert_eq!(state.page, 1);
  }

  #[test]
  fn thumb_request_dedupes_and_drains_fifo() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))], 1, true);
    state.enqueue_missing_thumbs();
    let first = state.drain_pending_thumbs();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].asset_id, "a1");
    // Second enqueue is a no-op: the request is already pending.
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 0);
  }

  #[test]
  fn resolved_cell_is_never_re_requested_and_ignores_late_failure() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))], 1, true);
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 1);
    state.apply_thumb("a1");
    assert!(state.cells[0].has_thumb);
    assert!(!state.cells[0].thumb_requested);
    // A resolved cell must not be re-requested on the next frame.
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 0);
    // A late failure for an already-resolved cell is discarded.
    state.apply_thumb_failed("a1");
    assert!(!state.cells[0].thumb_failed);
    assert!(state.cells[0].has_thumb);
  }

  #[test]
  fn failed_cell_marks_placeholder_and_stops_retrying() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))], 1, true);
    state.enqueue_missing_thumbs();
    state.drain_pending_thumbs();
    state.apply_thumb_failed("a1");
    assert!(state.cells[0].thumb_failed);
    assert!(!state.cells[0].thumb_requested);
    // No retry loop: a failed cell is not re-enqueued every frame.
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 0);
  }

  #[test]
  fn apply_error_surfaces_message_and_clears_loading() {
    let mut state = GalleryState::new();
    state.loading = true;
    state.apply_error("HTTP 500".to_string());
    assert_eq!(state.error.as_deref(), Some("HTTP 500"));
    assert!(!state.loading);
    // A successful page clears the previous error.
    state.apply_page(vec![asset("a1", "image", None)], 1, true);
    assert!(state.error.is_none());
  }

  #[test]
  fn apply_page_replace_clears_pending_thumbnail_requests() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", Some("/api/v1/assets/a1/thumb"))], 1, true);
    state.enqueue_missing_thumbs();
    state.apply_page(vec![asset("b1", "image", Some("/api/v1/assets/b1/thumb"))], 1, true);
    // The app enqueues once per frame before draining.
    state.enqueue_missing_thumbs();
    let drained = state.drain_pending_thumbs();
    // The superseded request for the previous query is gone; the new cell's is queued fresh.
    assert_eq!(drained.len(), 1);
    assert_eq!(drained[0].asset_id, "b1");
  }

  #[test]
  fn unknown_asset_id_is_ignored() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "image", None)], 1, true);
    state.apply_thumb("nope");
    state.apply_thumb_failed("nope");
    assert_eq!(state.cells.len(), 1);
    assert!(!state.cells[0].has_thumb);
    assert!(!state.cells[0].thumb_failed);
  }

  #[test]
  fn non_image_cells_never_request_thumbs() {
    let mut state = GalleryState::new();
    state.apply_page(vec![asset("a1", "audio", None)], 1, true);
    state.enqueue_missing_thumbs();
    assert_eq!(state.drain_pending_thumbs().len(), 0);
  }
}
