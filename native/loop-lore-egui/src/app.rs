//! The egui application: one focused chat screen.
//!
//! The whole client is a chat list, a transcript and a composer, bound to
//! the loop-lore v1 JSON API (see [`crate::api`]). The `htmx` frontend hands
//! control over with a browser-side transfer context (see
//! [`crate::context`]) and takes it back through the same context.

use std::cell::RefCell;
use std::rc::Rc;

use eframe::{App, CreationContext};
use egui::{Align, CentralPanel, Layout, Panel, ScrollArea, TextEdit};

use crate::api::{self, ChatMessage, ChatSummary, SentMessage};
use crate::client;
use crate::context::FrontendContext;
use crate::storage;
use crate::stream::{self, StreamEvent, StreamState};

/// A result handed back from a spawned fetch.
enum FetchEvent {
  /// Chat list page resolved.
  Chats(Result<Vec<ChatSummary>, String>),
  /// Message page resolved.
  Messages(Result<Vec<ChatMessage>, String>),
  /// Send resolved.
  Sent(Result<SentMessage, String>),
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
    }
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
    self.fetch_messages(chat_id, ctx,);
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
      }
    }
  }

  /// Apply every stream event queued by the bridge since the last frame.
  fn drain_stream_events(&mut self, ctx: &egui::Context) {
    for (chat_id, event) in stream::drain_stream_events() {
      // Stale guard: an event for a chat that is no longer active is dropped,
      // mirroring the htmx consumer's `isStale()`.
      let Some(session) = self.stream.as_mut() else { continue };
      if session.chat_id != chat_id { continue }
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
            self.fetch_messages(&chat_id, ctx,);
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
    self.drain_stream_events(ctx,);
    if !self.started {
      self.started = true;
      self.reload_chats(ctx);
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
            ui.label(&message.content);
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
        let response = ui.add(
          TextEdit::singleline(&mut self.composer)
            .hint_text("Message")
            .desired_width(f32::INFINITY),
        );
        let send =
          ui.button("Send").clicked() || (response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)));
        if send {
          self.send(&ctx);
        }
      });
    });
  }
}
