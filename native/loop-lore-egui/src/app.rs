//! The egui application: one focused chat screen.
//!
//! The whole client is a chat list, a transcript and a composer, bound to
//! the loop-lore v1 JSON API (see [`crate::api`]). The `htmx` frontend hands
//! control over with a browser-side transfer context (see
//! [`crate::context`]) and takes it back through the same context.

use std::cell::RefCell;
use std::rc::Rc;

use egui::{Align, CentralPanel, Layout, ScrollArea, SidePanel, TextEdit};
use eframe::{App, CreationContext};

use crate::api::{self, ChatMessage, ChatSummary, SentMessage, };
use crate::client;
use crate::context::FrontendContext;
use crate::storage;

/// A result handed back from a spawned fetch.
enum FetchEvent {
  /// Chat list page resolved.
  Chats(Result<Vec<ChatSummary>, String>),
  /// Message page resolved.
  Messages(Result<Vec<ChatMessage>, String>),
  /// Send resolved.
  Sent(Result<SentMessage, String>),
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
  /// Whether the first `update` already kicked off the initial loads.
  started: bool,
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
    self.context.active_chat_id = Some(chat_id.to_string());
    storage::save_context(&self.context);
    self.status = String::from("loading messages");
    self.messages.clear();
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
}

impl App for EguiApp {
  fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
    self.drain_events();
    if !self.started {
      self.started = true;
      self.reload_chats(ctx);
      if let Some(id) = self.context.active_chat_id.clone() {
        self.open_chat(&id, ctx);
      }
    }

    egui::TopBottomPanel::top("bar").show(ctx, |ui| {
      ui.horizontal(|ui| {
        if ui.button("Back to htmx").clicked() {
          storage::save_context(&self.context);
          storage::assign_location(&self.context.return_to);
        }
        ui.separator();
        ui.label(&self.status);
      });
    });

    SidePanel::left("chats")
      .resizable(true)
      .default_width(200.0)
      .show(ctx, |ui| {
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
          self.open_chat(&id, ctx);
        }
      });

    CentralPanel::default().show(ctx, |ui| {
      ScrollArea::vertical().stick_to_bottom(true).show(ui, |ui| {
        for message in &self.messages {
          ui.horizontal_wrapped(|ui| {
            ui.label(egui::RichText::new(&message.role).strong());
            ui.label(&message.content);
          });
        }
      });
      ui.with_layout(Layout::bottom_up(Align::Center), |ui| {
        let response = ui
          .add(TextEdit::singleline(&mut self.composer).hint_text("Message").desired_width(f32::INFINITY));
        let send = ui.button("Send").clicked()
          || (response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)));
        if send {
          self.send(ctx);
        }
      });
    });
  }
}
