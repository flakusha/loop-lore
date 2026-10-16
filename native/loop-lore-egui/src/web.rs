//! wasm entry: mount the egui app into the htmx page's canvas.
//!
//! The htmx page hosts a single `<canvas id="egui-canvas">` and loads this
//! crate as a module; mounting starts the whole egui app.

use wasm_bindgen::prelude::*;

use crate::app::EguiApp;

/// Mount the app into `#egui-canvas`.
///
/// Async because `WebRunner::start` is async in eframe 0.36 (the glow backend
/// initializes WebGL asynchronously); `#[wasm_bindgen(start)]` fires it and
/// does not await, matching the generated `wasm_bindgen` init the host page
/// calls.
#[wasm_bindgen(start)]
pub async fn start() -> Result<(), JsValue> {
  let window = web_sys::window().ok_or("no window")?;
  let document = window.document().ok_or("no document")?;
  let element = document
    .get_element_by_id(crate::storage::CANVAS_ID)
    .ok_or("#egui-canvas missing")?;
  let canvas = element
    .dyn_into::<web_sys::HtmlCanvasElement>()
    .map_err(|_| "#egui-canvas is not a canvas")?;
  let web_options = eframe::WebOptions::default();
  let app_creator: eframe::AppCreator<'_> =
    Box::new(|cc: &eframe::CreationContext<'_>| Ok(Box::new(EguiApp::new(cc)) as Box<dyn eframe::App>));
  eframe::WebRunner::new().start(canvas, web_options, app_creator).await?;
  Ok(())
}
