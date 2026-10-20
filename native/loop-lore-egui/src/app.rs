//! The egui application: one focused chat screen.
//!
//! The whole client is a chat list, a transcript and a composer, bound to
//! the loop-lore v1 JSON API (see [`crate::api`]). The `htmx` frontend hands
//! control over with a browser-side transfer context (see
//! [`crate::context`]) and takes it back through the same context.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use eframe::{App, CreationContext};
use egui::text::{CCursor, CCursorRange};
use egui::{Align, CentralPanel, Key, Layout, Modifiers, Panel, ScrollArea, TextEdit};

use crate::api::{self, ChatMessage, ChatSummary, CommandEntry, SentMessage};
use crate::client;
use crate::command;
use crate::context::FrontendContext;
use crate::emoji;
use crate::gallery::{self, GalleryState};
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
///
/// Every chat-scoped variant carries the chat it was requested for: a response
/// that lands after the user switched chats is stale and must not overwrite
/// the new transcript, palette or role gate.
enum FetchEvent {
  /// Chat list page resolved.
  Chats(Result<Vec<ChatSummary>, String>),
  /// Message page resolved for `chat_id`.
  Messages {
    chat_id: String,
    result: Result<Vec<ChatMessage>, String>,
  },
  /// Send resolved for `chat_id`.
  Sent {
    chat_id: String,
    result: Result<SentMessage, String>,
  },
  /// Emoji registry resolved.
  EmojiRegistry(Result<Vec<(String, String)>, String>),
  /// Command list resolved for `chat_id` (`None` = no chat, so not scoped).
  CommandList {
    chat_id: Option<String>,
    result: Result<(Vec<CommandEntry>, Option<String>), String>,
  },
  /// Gallery grid page resolved. Carries the request's own `page`/`replace`/
  /// `filters` so a response superseded by a newer search is dropped instead
  /// of being applied under the current filters' paging.
  GalleryPage {
    result: Result<Vec<crate::api::GalleryAsset>, String>,
    page: u32,
    replace: bool,
    filters: crate::api::GalleryFilters,
  },
  /// Asset attach resolved.
  Attach(Result<String, String>),
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
  /// Assistant command palette: registry entries + viewer role.
  commands: Vec<CommandEntry>,
  role_in_chat: Option<String>,
  /// Palette open flag — toggled by `/` in the composer.
  palette_open: bool,
  /// Current slash query (without leading `/`).
  palette_query: String,
  /// Highlighted palette index.
  palette_active: usize,
  /// Gallery grid state (rows, paging, thumbnail requests).
  gallery: GalleryState,
  /// Loaded gallery thumbnails, keyed by asset id.
  gallery_textures: HashMap<String, egui::TextureHandle>,
  /// Next gallery search query (set when the user presses Enter).
  gallery_search: String,
  /// Gallery asset-type filter (mirrors the htmx type dropdown).
  gallery_type: String,
  /// Gallery sort order (mirrors the htmx sort dropdown).
  gallery_sort: String,
  /// Gallery tab open flag (toggled from the top bar).
  gallery_open: bool,
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
      commands: Vec::new(),
      role_in_chat: None,
      palette_open: false,
      palette_query: String::new(),
      palette_active: 0,
      gallery: GalleryState::new(),
      gallery_textures: HashMap::new(),
      gallery_search: String::new(),
      gallery_type: String::from("all"),
      gallery_sort: String::from("name"),
      gallery_open: false,
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

  /// Spawn a one-shot fetch of the command registry.
  fn reload_commands(&self, ctx: &egui::Context) {
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    let chat_id = self.context.active_chat_id.clone();
    client::spawn(async move {
      let result = client::get_json(&api::command_list_url(chat_id.as_deref()))
        .await
        .and_then(|raw| api::parse_command_list(&raw));
      events.borrow_mut().push(FetchEvent::CommandList { chat_id, result });
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
    // `roleInChat` is per chat: without this the palette keeps gating on the
    // previous chat's role.
    self.reload_commands(ctx);
    self.fetch_messages(chat_id, ctx);
  }

  /// Spawn a message-page fetch for `chat_id`.
  fn fetch_messages(&self, chat_id: &str, ctx: &egui::Context) {
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    let url = api::messages_url(chat_id, 1);
    let chat_id = chat_id.to_string();
    client::spawn(async move {
      let result = client::get_json(&url)
        .await
        .and_then(|raw| api::parse_messages_page(&raw));
      events.borrow_mut().push(FetchEvent::Messages { chat_id, result });
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
    let sent_chat_id = chat_id.clone();
    client::spawn(async move {
      let result = client::post_json(&url, &body)
        .await
        .and_then(|raw| api::parse_sent_message(&raw));
      events.borrow_mut().push(FetchEvent::Sent {
        chat_id: sent_chat_id,
        result,
      });
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

  /// Commands visible to the current viewer (role-gated, display-only).
  fn visible_commands(&self) -> Vec<String> {
    let role = self.role_in_chat.as_deref();
    self
      .commands
      .iter()
      .filter(|c| command::satisfies_role(role, c.required_role.as_deref()))
      .map(|c| c.name.clone())
      .collect()
  }

  /// Filter visible commands by the current palette query.
  fn filtered_commands(&self) -> Vec<String> {
    let visible = self.visible_commands();
    let refs: Vec<&str> = visible.iter().map(String::as_str).collect();
    command::filter_commands(&refs, &self.palette_query)
      .into_iter()
      .map(String::from)
      .collect()
  }

  /// Accept a palette command: insert `/${name} ` into the composer.
  fn accept_command(&mut self, name: &str) {
    self.composer = command::insert_command(&self.composer, name);
    self.composer_caret = self.composer.chars().count();
    self.pending_caret = Some(self.composer_caret);
    self.close_palette();
  }

  /// Close the palette and forget its state.
  fn close_palette(&mut self) {
    self.palette_open = false;
    self.palette_query.clear();
    self.palette_active = 0;
  }

  /// Open the palette when the composer starts with `/`.
  fn sync_palette(&mut self) {
    if self.composer.starts_with('/') && !self.composer.contains(' ') {
      let query = self.composer[1..].to_lowercase();
      if !self.palette_open || self.palette_query != query {
        self.palette_query = query;
        self.palette_active = 0;
      }
      self.palette_open = true;
    } else {
      self.palette_open = false;
    }
  }

  /// Apply every fetch result queued since the last frame.
  fn drain_events(&mut self) {
    let drained: Vec<FetchEvent> = self.events.borrow_mut().drain(..).collect();
    let active = self.context.active_chat_id.clone();
    for event in drained {
      match event {
        FetchEvent::Chats(Ok(chats)) => {
          self.chats = chats;
          self.status = String::from("chats loaded");
        }
        FetchEvent::Chats(Err(e)) => self.status = format!("chat list failed: {e}"),
        FetchEvent::Messages { chat_id, result } => {
          if Some(&chat_id) != active.as_ref() {
            continue;
          }
          match result {
            Ok(messages) => {
              self.messages = messages;
              self.status = String::from("ready");
            }
            Err(e) => self.status = format!("messages failed: {e}"),
          }
        }
        FetchEvent::Sent { chat_id, result } => {
          if Some(&chat_id) != active.as_ref() {
            continue;
          }
          match result {
            Ok(sent) => {
              if let Some(message) = sent.message {
                self.messages.push(message);
              }
              if let Some(assistant) = sent.assistant {
                self.messages.push(assistant);
              }
              self.status = String::from("ready");
            }
            Err(e) => self.status = format!("send failed: {e}"),
          }
        }
        // The registry is a best-effort asset: without it bubbles show raw
        // `:shortcode:` text and the popup stays empty — never a hard error.
        FetchEvent::EmojiRegistry(Ok(registry)) => self.emoji_registry = registry,
        FetchEvent::EmojiRegistry(Err(_)) => {}
        FetchEvent::CommandList { chat_id, result } => {
          if chat_id != active {
            continue;
          }
          if let Ok((commands, role)) = result {
            self.commands = commands;
            self.role_in_chat = role;
          }
        }
        FetchEvent::GalleryPage {
          result,
          page,
          replace,
          filters,
        } => {
          // A newer search already reset the grid: this response is stale.
          if filters != self.gallery.filters {
            continue;
          }
          match result {
            Ok(assets) => {
              self.gallery.apply_page(assets, page, replace);
              self.status = String::from("gallery loaded");
            }
            Err(e) => {
              self.gallery.apply_error(format!("gallery failed: {e}"));
              self.status = format!("gallery failed: {e}");
            }
          }
        }
        FetchEvent::Attach(Ok(_)) => self.status = String::from("attached"),
        FetchEvent::Attach(Err(e)) => self.status = format!("attach failed: {e}"),
      }
    }
  }

  /// Spawn a gallery grid page fetch. `page` is 1-based.
  fn reload_gallery(&mut self, page: u32, replace: bool, ctx: &egui::Context) {
    if replace {
      self.gallery.set_filters(api::GalleryFilters {
        query: self.gallery_search.clone(),
        asset_type: self.gallery_type.clone(),
        tag: String::new(),
        sort: self.gallery_sort.clone(),
      });
    }
    let filters = self.gallery.filters.clone();
    self.gallery.loading = true;
    self.status = String::from("loading gallery");
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    client::spawn(async move {
      let url = api::gallery_grid_url(page, &filters);
      let result = client::get_json(&url)
        .await
        .and_then(|raw| api::parse_gallery_grid(&raw));
      events.borrow_mut().push(FetchEvent::GalleryPage {
        result,
        page,
        replace,
        filters,
      });
      ctx.request_repaint();
    });
  }

  /// Ask the bridge to open the file picker and upload the chosen file.
  fn upload_asset(&mut self) {
    self.status = String::from("uploading");
    gallery::upload_asset();
  }

  /// Attach `asset_id` to the active chat over the crate's own POST client —
  /// the same seam `send_message` uses, so cookies and CSRF are handled once.
  fn attach_asset(&mut self, asset_id: String, ctx: &egui::Context) {
    let Some(chat_id) = self.context.active_chat_id.clone() else {
      self.status = String::from("pick a chat first");
      return;
    };
    self.status = String::from("attaching");
    let url = api::gallery_attach_url(&asset_id);
    let body = api::gallery_attach_body(&chat_id);
    let events = Rc::clone(&self.events);
    let ctx = ctx.clone();
    client::spawn(async move {
      let result = client::post_json(&url, &body).await.map(|_| asset_id);
      events.borrow_mut().push(FetchEvent::Attach(result));
      ctx.request_repaint();
    });
  }

  /// Render the gallery panel: search bar, upload button, and asset grid.
  fn render_gallery(&mut self, ui: &mut egui::Ui) {
    let ctx = ui.ctx().clone();

    // Search bar + type/sort dropdowns (mirrors the htmx filter bar) + upload.
    let mut refetch = false;
    ui.horizontal(|ui| {
      let search = TextEdit::singleline(&mut self.gallery_search)
        .id_salt("gallery-search")
        .hint_text("Search assets")
        .desired_width(ui.available_width() - 320.0)
        .show(ui);
      if search.response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
        refetch = true;
      }
      egui::ComboBox::from_id_salt("gallery-type")
        .selected_text(self.gallery_type.as_str())
        .show_ui(ui, |ui| {
          for option in ["all", "image", "audio", "video"] {
            if ui
              .selectable_value(&mut self.gallery_type, option.to_string(), option)
              .clicked()
            {
              refetch = true;
            }
          }
        });
      egui::ComboBox::from_id_salt("gallery-sort")
        .selected_text(self.gallery_sort.as_str())
        .show_ui(ui, |ui| {
          for option in ["name", "newest", "oldest"] {
            if ui
              .selectable_value(&mut self.gallery_sort, option.to_string(), option)
              .clicked()
            {
              refetch = true;
            }
          }
        });
      if ui.button("Upload").clicked() {
        self.upload_asset();
      }
    });
    if refetch {
      self.reload_gallery(1, true, &ctx);
    }

    if let Some(error) = self.gallery.error.clone() {
      ui.colored_label(egui::Color32::RED, &error);
    }
    if self.gallery.loading && self.gallery.cells.is_empty() {
      ui.spinner();
      ui.label("loading...");
      return;
    }
    if self.gallery.cells.is_empty() {
      ui.label("No assets yet");
      return;
    }

    // Asset grid: 4 columns, thumbnails with filename + attach button.
    let cell_size = 160.0;
    let cols = 4;
    let mut attach_clicked: Option<String> = None;
    egui::Grid::new("gallery-grid")
      .spacing([8.0, 8.0])
      .min_col_width(cell_size)
      .show(ui, |ui| {
        let mut col = 0;
        for cell in &self.gallery.cells {
          ui.vertical(|ui| {
            ui.set_min_size([cell_size, cell_size + 40.0].into());

            // Thumbnail or placeholder.
            if let Some(texture) = self.gallery_textures.get(&cell.asset.id) {
              let img = egui::Image::new(texture).fit_to_exact_size(egui::vec2(cell_size, cell_size));
              ui.add(img);
            } else {
              let (rect, _) = ui.allocate_exact_size(egui::vec2(cell_size, cell_size), egui::Sense::hover());
              ui.painter().rect_stroke(
                rect,
                4.0,
                egui::Stroke::new(1.0, egui::Color32::GRAY),
                egui::StrokeKind::Outside,
              );
              if cell.thumb_failed {
                ui.label("[failed]");
              } else {
                ui.spinner();
              }
            }

            // Filename (truncated on a char boundary, never a byte index).
            ui.label(egui::RichText::new(gallery::ellipsize(&cell.asset.filename, 20)).small());

            // Attach button.
            if ui.button("Attach").clicked() {
              attach_clicked = Some(cell.asset.id.clone());
            }
          });

          col += 1;
          if col >= cols {
            col = 0;
            ui.end_row();
          }
        }
        if col != 0 {
          ui.end_row();
        }
      });
    if let Some(asset_id) = attach_clicked {
      self.attach_asset(asset_id, &ctx);
    }

    // Load more.
    if self.gallery.has_more && !self.gallery.loading {
      ui.horizontal(|ui| {
        if ui.button("Load more").clicked() {
          self.reload_gallery(self.gallery.page + 1, false, &ctx);
        }
      });
    }
  }

  /// Drain thumbnail requests to the bridge and ready/failed uploads back.
  fn drain_gallery_bridge(&mut self, ctx: &egui::Context) {
    // Pending thumbnails -> bridge. `drain_pending_thumbs` marks each cell
    // as requested so the next `enqueue_missing_thumbs` skips it.
    self.gallery.enqueue_missing_thumbs();
    for request in self.gallery.drain_pending_thumbs() {
      gallery::request_thumbnail(&request.asset_id, &request.url);
    }
    // Ready thumbnails -> texture cache.
    for pixels in gallery::drain_thumb_ready() {
      let expected = pixels.width as usize * pixels.height as usize * 4;
      // Dimensions and byte length come from the bridge; a mismatch means a
      // truncated or mis-decoded buffer, which egui would read out of bounds.
      if pixels.width > 0 && pixels.height > 0 && pixels.rgba.len() == expected {
        let image =
          egui::ColorImage::from_rgba_unmultiplied([pixels.width as usize, pixels.height as usize], &pixels.rgba);
        let handle = ctx.load_texture(
          &format!("gallery:{}", pixels.asset_id),
          image,
          egui::TextureOptions::default(),
        );
        self.gallery_textures.insert(pixels.asset_id.clone(), handle);
        self.gallery.apply_thumb(&pixels.asset_id);
      } else {
        self.gallery.apply_thumb_failed(&pixels.asset_id);
      }
    }
    for asset_id in gallery::drain_thumb_failed() {
      self.gallery.apply_thumb_failed(&asset_id);
    }
    // Upload completion.
    for asset_id in gallery::drain_uploaded() {
      if asset_id.is_empty() {
        self.status = String::from("upload failed");
      } else {
        self.status = String::from("uploaded");
        self.reload_gallery(self.gallery.page, true, ctx);
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
    if self.gallery_open {
      self.drain_gallery_bridge(ctx);
    }
    if !self.started {
      self.started = true;
      self.reload_chats(ctx);
      self.reload_emoji_registry(ctx);
      // With an active chat `open_chat` owns the command fetch (it is
      // chat-scoped); only the no-chat case needs one here.
      match self.context.active_chat_id.clone() {
        Some(id) => self.open_chat(&id, ctx),
        None => self.reload_commands(ctx),
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
        if ui.selectable_label(!self.gallery_open, "Chat").clicked() {
          self.gallery_open = false;
        }
        if ui.selectable_label(self.gallery_open, "Gallery").clicked() {
          self.gallery_open = true;
          if self.gallery.cells.is_empty() && !self.gallery.loading {
            self.reload_gallery(1, true, &ctx);
          }
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
      if self.gallery_open {
        self.render_gallery(ui);
        return;
      }
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
        // Keyboard first: palette and popover must swallow Tab/Enter/Escape/arrows
        // before the TextEdit can act on them (Enter would send the message).
        let mut clicked: Option<usize> = None;
        if self.palette_open {
          let visible = self.filtered_commands();
          let count = visible.len();
          // The query may have changed since `palette_active` was set; keep it
          // in bounds so the accept index below never panics.
          if self.palette_active >= count {
            self.palette_active = 0;
          }
          // Mirrors the Alpine `handleComposerEnter`: Enter/Tab accept only
          // when there is a match; with an empty list Enter falls through and
          // sends the message. Escape and arrows always act while open.
          let (down, up, tab, enter, escape) = ui.input_mut(|i| {
            let down = i.consume_key(Modifiers::NONE, Key::ArrowDown);
            let up = i.consume_key(Modifiers::NONE, Key::ArrowUp);
            let tab = count > 0 && i.consume_key(Modifiers::NONE, Key::Tab);
            let enter = count > 0 && i.consume_key(Modifiers::NONE, Key::Enter);
            let escape = i.consume_key(Modifiers::NONE, Key::Escape);
            (down, up, tab, enter, escape)
          });
          if down && count > 0 {
            self.palette_active = (self.palette_active + 1) % count;
          } else if up && count > 0 {
            self.palette_active = (self.palette_active + count - 1) % count;
          } else if tab || enter {
            let name = visible[self.palette_active].clone();
            self.accept_command(&name);
          } else if escape {
            self.close_palette();
          }
        }
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
        self.sync_palette();

        let mut palette_clicked: Option<usize> = None;
        if self.palette_open {
          let filtered = self.filtered_commands();
          if filtered.is_empty() {
            ui.label(egui::RichText::new("no matching commands").italics());
          } else {
            if self.palette_active >= filtered.len() {
              self.palette_active = 0;
            }
            for (index, name) in filtered.iter().enumerate() {
              if ui
                .selectable_label(index == self.palette_active, format!("/{name}"))
                .clicked()
              {
                palette_clicked = Some(index);
              }
            }
          }
        }
        if let Some(index) = palette_clicked {
          self.palette_active = index;
          if let Some(name) = self.filtered_commands().get(index).cloned() {
            self.accept_command(&name);
          }
        }

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
