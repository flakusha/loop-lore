//! The egui application: one focused chat screen.
//!
//! The whole client is a chat list, a transcript and a composer, bound to
//! the loop-lore v1 JSON API (see [`crate::api`]). The `htmx` frontend hands
//! control over with a browser-side transfer context (see
//! [`crate::context`]) and takes it back through the same context.

use std::cell::RefCell;
use std::rc::Rc;

use eframe::{App, CreationContext};
use egui::text::{CCursor, CCursorRange};
use egui::{Align, CentralPanel, Key, Layout, Modifiers, Panel, ScrollArea, TextEdit};

use crate::api::{self, ChatMessage, ChatSummary, SentMessage};
use crate::client;
use crate::context::FrontendContext;
use crate::emoji;
use crate::storage;
use crate::stream::{self, StreamEvent, StreamState};

/// Convert a byte offset into a char offset (egui's caret unit).
fn char_index(text: &str, byte: usize) -> usize {
  text[..byte.min(text.len())].chars().count()
}

/// Convert a char offset into a byte offset.
fn byte_index(text: &str, chars: usize) -> usize {
  text.char_indices().nth(chars).map_or(text.len(), |(b, _)| b)
}

/// A result handed back from a spawned fetch.
enum FetchEvent {
  /// Chat list page resolved.
  Chats(Result<Vec<ChatSummary>, String>),
  /// Message page resolved.
  Messages(Result<Vec<ChatMessage>, String>),
  /// Send resolved.
  Sent(Result<SentMessage, String>),
  /// Emoji registry resolved.
  EmojiRegistry(Result<Vec<(String, String)>, String>),
}

/// One live generation stream: the chat it belongs to plus its state.
///
/// The chat id rides along so a late event from a stream the user already
/// left is discarded — the htmx consumer's `isStale()` guard.
struct StreamSession {
  chat_id: String,
  state: StreamState,
}

/// The experimental egui frontend.
pub struct EguiApp {
  /// Where htmx lands on return plus which chat is active.
  context: FrontendContext,
  /// Chat rows from the API.
  chats: Vec<ChatSummary>,
  /// Message rows of the active chat.
  messages: Vec<ChatMessage>,
  /// Composer text.
  composer: String,
  /// One-line status line (errors surface here).
  status: String,
  /// Fetch results, appended from spawned futures.
  events: Rc<RefCell<Vec<FetchEvent>>>,
  /// Whether the first `logic` pass already kicked off the initial loads.
  started: bool,
  /// The live generation stream, if one is open for the active chat.
  stream: Option<StreamSession>,
  /// Server-owned `:shortcode:` registry, fetched once as JSON.
  emoji_registry: Vec<(String, String)>,
  /// Composer emoji autocomplete: the open query, or `None` when closed.
  emoji_query: Option<String>,
  /// Filtered `(name, emoji)` candidates for the open query.
  emoji_candidates: Vec<(String, String)>,
  /// Highlighted candidate index.
  emoji_active: usize,
  /// Composer caret in chars, as of the last frame (egui's caret unit).
  composer_caret: usize,
  /// A caret char index to apply after the next `TextEdit` show (accept).
  pending_caret: Option<usize>,
}

impl EguiApp {
  /// Build the app, adopting any context the htmx frontend stored.
  pub fn new(_cc: &CreationContext<'_>) -> Self {
    Self {
      context: storage::load_context(),
      chats: Vec::new(),
      messages: Vec::new(),
      composer: String::new(),
      status: String::from("loading"),
      events: Rc::new(RefCell::new(Vec::new())),
      started: false,
      stream: None,
      emoji_registry: Vec::new(),
      emoji_query: None,
      emoji_candidates: Vec::new(),
      emoji_active: 0,
      composer_caret: 0,
      pending_caret: None,
    }
  }

  /// Spawn a one-shot fetch of the server-owned emoji registry.
  fn reload_emoji_registry(&self, ctx: &egui::Context) {
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    client::spawn(async move {
      let result = client::get_json(api::emoji_registry_url())
        .await
        .and_then(|raw| api::parse_emoji_registry(&raw));
      events.borrow_mut().push(FetchEvent::EmojiRegistry(result));
      ctx.request_repaint();
    });
  }

  /// Spawn a chat-list fetch.
  fn reload_chats(&mut self, ctx: &egui::Context) {
    self.status = String::from("loading chats");
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    client::spawn(async move {
      let result = client::get_json(&api::chats_list_url(1))
        .await
        .and_then(|raw| api::parse_chats_page(&raw));
      events.borrow_mut().push(FetchEvent::Chats(result));
      ctx.request_repaint();
    });
  }

  /// Switch the active chat, persisting it for the htmx hand-back.
  fn open_chat(&mut self, chat_id: &str, ctx: &egui::Context) {
    self.close_stream();
    self.context.active_chat_id = Some(chat_id.to_string());
    storage::save_context(&self.context);
    self.status = String::from("loading messages");
    self.messages.clear();
    self.fetch_messages(chat_id, ctx);
  }

  /// Spawn a message-page fetch for `chat_id`.
  fn fetch_messages(&self, chat_id: &str, ctx: &egui::Context) {
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    let url = api::messages_url(chat_id, 1);
    client::spawn(async move {
      let result = client::get_json(&url)
        .await
        .and_then(|raw| api::parse_messages_page(&raw));
      events.borrow_mut().push(FetchEvent::Messages(result));
      ctx.request_repaint();
    });
  }

  /// Send the composer text to the active chat.
  fn send(&mut self, ctx: &egui::Context) {
    let content = self.composer.trim().to_string();
    let Some(chat_id) = self.context.active_chat_id.clone() else {
      self.status = String::from("pick a chat first");
      return;
    };
    if content.is_empty() {
      return;
    }
    let url = api::send_message_url(&chat_id);
    let body = api::send_message_body(&content);
    self.composer.clear();
    self.status = String::from("sending");
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    client::spawn(async move {
      let result = client::post_json(&url, &body)
        .await
        .and_then(|raw| api::parse_sent_message(&raw));
      events.borrow_mut().push(FetchEvent::Sent(result));
      ctx.request_repaint();
    });
    // htmx parity: the stream is connected when a generation is STARTED
    // (`sendWithPreferredMode` -> `connectGenerationSSE`), not on chat entry
    // — a chat with no running generation would only ever see the server's
    // "No active generation" terminal error.
    stream::open_stream(&chat_id);
    self.stream = Some(StreamSession {
      chat_id,
      state: StreamState::default(),
    });
  }

  /// Close the live stream (bridge teardown) and forget its state.
  fn close_stream(&mut self) {
    if let Some(session) = self.stream.take() {
      stream::close_stream(&session.chat_id);
    }
  }

  /// Recompute the composer emoji popover from the caret position.
  ///
  /// Mirrors `handleEmojiInput`: a `:query` token ending at the caret opens
  /// the popover with the filtered registry; anything else closes it.
  fn sync_emoji_popover(&mut self) {
    let caret_byte = byte_index(&self.composer, self.composer_caret);
    match emoji::extract_query(&self.composer[..caret_byte]) {
      Some(query) => {
        let names = emoji::filter_candidates(&query, &self.emoji_registry);
        self.emoji_candidates = names
          .into_iter()
          .map(|name| {
            let glyph = self
              .emoji_registry
              .iter()
              .find(|(n, _)| *n == name)
              .map_or_else(String::new, |(_, e)| e.clone());
            (name, glyph)
          })
          .collect();
        // Only a CHANGED query resets the highlight: this runs every frame,
        // and resetting unconditionally would undo the arrow keys.
        if self.emoji_query.as_deref() != Some(query.as_str()) {
          self.emoji_active = 0;
        }
        self.emoji_query = Some(query);
      }
      None => self.close_emoji_popover(),
    }
  }

  /// Close the popover and forget its state.
  fn close_emoji_popover(&mut self) {
    self.emoji_query = None;
    self.emoji_candidates.clear();
    self.emoji_active = 0;
  }

  /// Insert the highlighted candidate, mirroring `selectEmojiCandidate`.
  fn accept_emoji(&mut self) {
    let Some((name, _)) = self.emoji_candidates.get(self.emoji_active).cloned() else {
      return;
    };
    let caret_byte = byte_index(&self.composer, self.composer_caret);
    let Some((new_text, new_caret_byte)) = emoji::insert_candidate(&self.composer, caret_byte, &name) else {
      return;
    };
    // The popover is recomputed from the caret at the end of the frame, so
    // the caret must move with the text — otherwise the just-closed popover
    // re-opens once against the old position.
    self.composer_caret = char_index(&new_text, new_caret_byte);
    self.pending_caret = Some(self.composer_caret);
    self.composer = new_text;
    self.close_emoji_popover();
  }

  /// Apply every fetch result queued since the last frame.
  fn drain_events(&mut self) {
    let drained: Vec<FetchEvent> = self.events.borrow_mut().drain(..).collect();
    for event in drained {
      match event {
        FetchEvent::Chats(Ok(chats)) => {
          self.chats = chats;
          self.status = String::from("chats loaded");
        }
        FetchEvent::Chats(Err(e)) => self.status = format!("chat list failed: {e}"),
        FetchEvent::Messages(Ok(messages)) => {
          self.messages = messages;
          self.status = String::from("ready");
        }
        FetchEvent::Messages(Err(e)) => self.status = format!("messages failed: {e}"),
        FetchEvent::Sent(Ok(sent)) => {
          self.messages.push(sent.message);
          if let Some(assistant) = sent.assistant {
            self.messages.push(assistant);
          }
          self.status = String::from("ready");
        }
        FetchEvent::Sent(Err(e)) => self.status = format!("send failed: {e}"),
        // The registry is a best-effort asset: without it bubbles show raw
        // `:shortcode:` text and the popup stays empty — never a hard error.
        FetchEvent::EmojiRegistry(Ok(registry)) => self.emoji_registry = registry,
        FetchEvent::EmojiRegistry(Err(_)) => {}
      }
    }
  }

  /// Apply every stream event queued by the bridge since the last frame.
  fn drain_stream_events(&mut self, ctx: &egui::Context) {
    for (chat_id, event) in stream::drain_stream_events() {
      // Stale guard: an event for a chat that is no longer active is dropped,
      // mirroring the htmx consumer's `isStale()`.
      let Some(session) = self.stream.as_mut() else { continue };
      if session.chat_id != chat_id {
        continue;
      }
      session.state.apply(&event);
      let error_message = session.state.error.clone();
      let terminal = session.state.is_terminal();

      match &event {
        StreamEvent::Update(_) => self.status = String::from("streaming"),
        StreamEvent::ToolCall(_) => {}
        StreamEvent::Done => {
          self.status = String::from("ready");
          // htmx reloads the message list on stream-done: the stored
          // messages are authoritative again.
          if let Some(chat_id) = self.context.active_chat_id.clone() {
            self.fetch_messages(&chat_id, ctx);
          }
        }
        StreamEvent::Error(_) => {
          if let Some(message) = error_message {
            self.status = format!("stream error: {message}");
          }
        }
      }
      if terminal {
        // The server closed the stream; without this the browser would
        // reconnect and replay the whole buffer (htmx `_cleanupSSE`).
        self.close_stream();
      }
    }
  }
}

impl App for EguiApp {
  fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
    self.drain_events();
    self.drain_stream_events(ctx);
    if !self.started {
      self.started = true;
      self.reload_chats(ctx);
      self.reload_emoji_registry(ctx);
      if let Some(id) = self.context.active_chat_id.clone() {
        self.open_chat(&id, ctx);
      }
    }
  }

  fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
    let ctx = ui.ctx().clone();

    Panel::top("bar").show(ui, |ui| {
      ui.horizontal(|ui| {
        if ui.button("Back to htmx").clicked() {
          // Teardown symmetry with htmx `_cleanupSSE`: the stream dies with
          // the client that owns it.
          self.close_stream();
          storage::save_context(&self.context);
          storage::assign_location(&self.context.return_to);
        }
        ui.separator();
        ui.label(&self.status);
      });
    });

    Panel::left("chats").resizable(true).default_size(200.0).show(ui, |ui| {
      ui.heading("Chats");
      let mut clicked = None;
      ScrollArea::vertical().show(ui, |ui| {
        for chat in &self.chats {
          let selected = self.context.active_chat_id.as_deref() == Some(chat.id.as_str());
          if ui.selectable_label(selected, chat.label()).clicked() {
            clicked = Some(chat.id.clone());
          }
        }
      });
      if let Some(id) = clicked {
        self.open_chat(&id, &ctx);
      }
    });

    CentralPanel::default().show(ui, |ui| {
      ScrollArea::vertical().stick_to_bottom(true).show(ui, |ui| {
        for message in &self.messages {
          ui.horizontal_wrapped(|ui| {
            ui.label(egui::RichText::new(&message.role).strong());
            // Bubble text renders `:shortcode:` tokens against the server
            // registry, mirroring `renderShortcodes` in the htmx client.
            ui.label(emoji::render_shortcodes(&message.content, &self.emoji_registry));
          });
        }
        if let Some(session) = &self.stream {
          ui.horizontal_wrapped(|ui| {
            ui.label(egui::RichText::new("assistant").strong());
            ui.label(&session.state.text);
          });
          for call in &session.state.tool_calls {
            ui.horizontal_wrapped(|ui| {
              ui.label(egui::RichText::new("tool").italics());
              ui.label(call);
            });
          }
        }
      });
      ui.with_layout(Layout::bottom_up(Align::Center), |ui| {
        // Keyboard first: the popover must swallow Tab/Enter/Escape/arrows
        // before the TextEdit can act on them (Enter would send the message).
        let mut clicked: Option<usize> = None;
        if self.emoji_query.is_some() && !self.emoji_candidates.is_empty() {
          let (down, up, tab, enter, escape) = ui.input_mut(|i| {
            (
              i.consume_key(Modifiers::NONE, Key::ArrowDown),
              i.consume_key(Modifiers::NONE, Key::ArrowUp),
              i.consume_key(Modifiers::NONE, Key::Tab),
              i.consume_key(Modifiers::NONE, Key::Enter),
              i.consume_key(Modifiers::NONE, Key::Escape),
            )
          });
          let count = self.emoji_candidates.len();
          if down {
            self.emoji_active = (self.emoji_active + 1) % count;
          } else if up {
            self.emoji_active = (self.emoji_active + count - 1) % count;
          } else if tab || enter {
            self.accept_emoji();
          } else if escape {
            self.close_emoji_popover();
          }
        }

        let mut output = TextEdit::singleline(&mut self.composer)
          .id_salt("composer")
          .hint_text("Message")
          .desired_width(f32::INFINITY)
          .show(ui);

        // Track the caret every frame; an accept overrides it (egui's stored
        // caret is stale for one frame after the text is replaced, and the
        // popover must not re-open against the old position).
        if let Some(range) = output.cursor_range {
          self.composer_caret = usize::from(range.primary.index);
        }
        if let Some(caret) = self.pending_caret.take() {
          self.composer_caret = caret;
          output
            .state
            .cursor
            .set_char_range(Some(CCursorRange::one(CCursor::new(caret))));
          output.state.store(ui.ctx(), output.response.id);
          ui.ctx().memory_mut(|m| m.request_focus(output.response.id));
        }

        // Recompute the popover from the caret BEFORE drawing it: the state
        // must reflect this frame's text, and egui does not repaint without
        // input, so a one-frame lag would never be drawn.
        self.sync_emoji_popover();

        if self.emoji_query.is_some() && !self.emoji_candidates.is_empty() {
          let candidates = self.emoji_candidates.clone();
          // ponytail: labels directly, no wrapper — bottom_up + scope/vertical
          // don't allocate space. Add when we need a real popup overlay.
          for (index, (name, glyph)) in candidates.iter().enumerate() {
            let label = format!("{glyph}  :{name}:");
            if ui.selectable_label(index == self.emoji_active, label).clicked() {
              clicked = Some(index);
            }
          }
        }
        if let Some(index) = clicked {
          self.emoji_active = index;
          self.accept_emoji();
        }

        let send =
          ui.button("Send").clicked() || (output.response.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)));
        if send {
          self.send(&ctx);
        }
      });
    });
  }
}
