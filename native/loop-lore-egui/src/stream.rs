// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

//! SSE response streaming, consumed by the bridge-owned `EventSource`.
//!
//! reqwest has no `EventSource` (seanmonstar/reqwest#2677) and the wasm target
//! has no sockets at all, so the stream is owned by the JS bridge
//! (`src/frontend/egui-stream.ts`, global `window.loopLoreEguiStream`) and
//! handed to Rust through the exported sink functions at the bottom of this
//! file. The reducer ([`StreamState::apply`]) is pure and host-tested; the
//! queue is host-testable; only the `#[wasm_bindgen]` exports themselves are
//! wasm-gated.

use std::cell::RefCell;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// One server event, normalized by the bridge from the htmx stream contract
/// (`stream-update` / `tool_call` / `stream-done` / `stream-error`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamEvent {
  /// `stream-update`: the full HTML of the streaming bubble so far.
  Update(String),
  /// `tool_call`: the raw tool-call payload.
  ToolCall(String),
  /// `stream-done`: the generation finished.
  Done,
  /// `stream-error`: the JSON error payload from the server.
  Error(String),
}

/// The evolving state of one chat's stream.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StreamState {
  /// Latest rendered text of the streaming bubble.
  pub text: String,
  /// Tool-call payloads in arrival order.
  pub tool_calls: Vec<String>,
  /// Terminal flag: the generation finished.
  pub done: bool,
  /// Terminal flag: the generation failed, with the server's message.
  pub error: Option<String>,
}

impl StreamState {
  /// `true` once a terminal event (`Done` or `Error`) has been applied.
  pub fn is_terminal(&self) -> bool {
    self.done || self.error.is_some()
  }

  /// Apply one event.
  ///
  /// `Update` REPLACES the text — the server sends the full bubble on every
  /// chunk, and a reconnect replays the buffer from its start, so append
  /// semantics would duplicate content on every reconnect.
  pub fn apply(&mut self, event: &StreamEvent) {
    match event {
      StreamEvent::Update(html) => self.text = strip_html_tags(html),
      StreamEvent::ToolCall(payload) => self.tool_calls.push(payload.clone()),
      StreamEvent::Done => self.done = true,
      StreamEvent::Error(payload) => self.error = Some(error_message(payload)),
    }
  }
}

/// Strip HTML tags and decode the minimal entity set the server escapes
/// message text with, so the canvas can render plain text.
pub fn strip_html_tags(html: &str) -> String {
  let mut out = String::with_capacity(html.len());
  let mut rest = html;
  while let Some(start) = rest.find('<') {
    out.push_str(&rest[..start]);
    match rest[start..].find('>') {
      Some(end) => rest = &rest[start + end + 1..],
      // Unterminated tag: drop the remainder, it is markup debris.
      None => return decode_entities(&out),
    }
  }
  out.push_str(rest);
  decode_entities(&out)
}

/// Decode the five entities `escapeHtml` emits (`src/routes/views/escape-html.ts`).
fn decode_entities(text: &str) -> String {
  text
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&#39;", "'")
    .replace("&amp;", "&")
}

/// Extract the `error` field from a `stream-error` payload, falling back to
/// the raw payload when it is not the expected JSON object.
fn error_message(payload: &str) -> String {
  serde_json::from_str::<serde_json::Value>(payload)
    .ok()
    .and_then(|value| value.get("error").and_then(|field| field.as_str()).map(String::from))
    .unwrap_or_else(|| payload.to_string())
}

thread_local! {
  /// Events queued by the sink exports, drained once per frame by the app.
  static EVENTS: RefCell<Vec<(String, StreamEvent)>> = const { RefCell::new(Vec::new()) };
}

/// Queue one event for `chat_id`.
pub fn push_stream_event(chat_id: String, event: StreamEvent) {
  EVENTS.with(|queue| queue.borrow_mut().push((chat_id, event)));
}

/// Drain every queued event, in arrival order.
pub fn drain_stream_events() -> Vec<(String, StreamEvent)> {
  EVENTS.with(|queue| queue.borrow_mut().drain(..).collect())
}

/// Sink export for `stream-update`; the /egui host page installs it on
/// `window.loopLoreEguiStream` from the glue module's named exports.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_stream_update(chat_id: &str, html: &str) {
  push_stream_event(chat_id.to_string(), StreamEvent::Update(html.to_string()));
}

/// Sink export for `tool_call`.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_stream_tool_call(chat_id: &str, payload: &str) {
  push_stream_event(chat_id.to_string(), StreamEvent::ToolCall(payload.to_string()));
}

/// Sink export for `stream-done`.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_stream_done(chat_id: &str) {
  push_stream_event(chat_id.to_string(), StreamEvent::Done);
}

/// Sink export for `stream-error`.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn egui_stream_error(chat_id: &str, payload: &str) {
  push_stream_event(chat_id.to_string(), StreamEvent::Error(payload.to_string()));
}

// Bridge functions the wasm app imports; `src/frontend/egui-stream.ts`
// defines both globals when the bridge bundle initializes.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
  #[wasm_bindgen(js_name = openGenerationStream)]
  fn js_open_generation_stream(chat_id: &str);
  #[wasm_bindgen(js_name = closeGenerationStream)]
  fn js_close_generation_stream(chat_id: &str);
}

/// Ask the bridge to open the generation stream for `chat_id`.
#[cfg(target_arch = "wasm32")]
pub fn open_stream(chat_id: &str) {
  js_open_generation_stream(chat_id);
}

/// Ask the bridge to close the generation stream for `chat_id`.
#[cfg(target_arch = "wasm32")]
pub fn close_stream(chat_id: &str) {
  js_close_generation_stream(chat_id);
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn update_replaces_the_streamed_text() {
    let mut state = StreamState::default();
    state.apply(&StreamEvent::Update(String::from("<p>Hel",),),);
    state.apply(&StreamEvent::Update(String::from("<p>Hello",),),);
    assert_eq!(state.text, "Hello");
  }

  #[test]
  fn tags_are_stripped_and_entities_decoded() {
    let mut state = StreamState::default();
    state.apply(&StreamEvent::Update(String::from("<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;</p>",),),);
    assert_eq!(state.text, "a & b <c> \"d\" 'e'");
  }

  #[test]
  fn unterminated_tag_drops_the_debris() {
    assert_eq!(strip_html_tags("text <b"), "text ");
  }

  #[test]
  fn tool_calls_accumulate_in_arrival_order() {
    let mut state = StreamState::default();
    state.apply(&StreamEvent::ToolCall(String::from("first",),),);
    state.apply(&StreamEvent::ToolCall(String::from("second",),),);
    assert_eq!(state.tool_calls, vec![String::from("first"), String::from("second")]);
  }

  #[test]
  fn done_is_terminal_and_keeps_the_text() {
    let mut state = StreamState::default();
    state.apply(&StreamEvent::Update(String::from("done text",),),);
    state.apply(&StreamEvent::Done,);
    assert!(state.is_terminal());
    assert!(state.done);
    assert_eq!(state.text, "done text");
  }

  #[test]
  fn error_extracts_the_server_message() {
    let mut state = StreamState::default();
    state.apply(&StreamEvent::Error(String::from("{\"error\":\"No active generation\"}",),),);
    assert!(state.is_terminal());
    assert_eq!(state.error.as_deref(), Some("No active generation"));
  }

  #[test]
  fn error_falls_back_to_the_raw_payload() {
    let mut state = StreamState::default();
    state.apply(&StreamEvent::Error(String::from("plain text failure",),),);
    assert_eq!(state.error.as_deref(), Some("plain text failure"));
  }

  #[test]
  fn events_drain_in_arrival_order() {
    push_stream_event(String::from("c1",), StreamEvent::Done,);
    push_stream_event(String::from("c2",), StreamEvent::ToolCall(String::from("t",),),);
    let drained = drain_stream_events();
    assert_eq!(
      drained,
      vec![
        (String::from("c1",), StreamEvent::Done),
        (String::from("c2",), StreamEvent::ToolCall(String::from("t",),)),
      ]
    );
    assert_eq!(drain_stream_events(), Vec::new());
  }
}
