//! JSON client for the loop-lore v1 API — the only integration surface.
//!
//! Same-origin requests: the browser attaches the session cookie, and the
//! CSRF double-submit cookie (`csrf_token`, non-HttpOnly) is echoed as the
//! `X-CSRF-Token` header on unsafe methods — the same contract the htmx
//! frontend's `fe-fetch` implements.
//!
//! Everything in this module except [`get_json`]/[`post_json`] is pure and
//! unit-tested on the host; the fetch pair is the only wasm-gated code.

use serde::Serialize;

/// Page size for every list request.
const PAGE_SIZE: u32 = 50;

/// A chat row as the grid needs it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatSummary {
  /// Chat id.
  pub id: String,
  /// Raw `name` column; `None` renders as a fallback label.
  pub name: Option<String>,
  /// `direct` | `group`.
  pub chat_type: String,
  /// Raw `updated_at` column.
  pub updated_at: String,
}

impl ChatSummary {
  /// Display label: the chat name, or a stable placeholder.
  pub fn label(&self) -> &str {
    self
      .name
      .as_deref()
      .filter(|n| !n.is_empty())
      .unwrap_or("(unnamed chat)")
  }
}

/// A message row as the transcript needs it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatMessage {
  /// Message id.
  pub id: String,
  /// `user` | `assistant` | `system`.
  pub role: String,
  /// Message text; empty for non-text messages.
  pub content: String,
  /// Raw `created_at` column.
  pub created_at: String,
}

/// Result of a successful send: the stored user message plus the auto-reply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SentMessage {
  /// The stored user message.
  pub message: ChatMessage,
  /// The assistant auto-reply, when the server produced one.
  pub assistant: Option<ChatMessage>,
}

/// URL for the chat list page.
pub fn chats_list_url(page: u32) -> String {
  format!("/api/v1/chats?page={page}&pageSize={PAGE_SIZE}")
}

/// URL for one chat's message page.
pub fn messages_url(chat_id: &str, page: u32) -> String {
  format!("/api/v1/chats/{chat_id}/messages?page={page}&pageSize={PAGE_SIZE}")
}

/// URL for the send endpoint.
pub fn send_message_url(chat_id: &str) -> String {
  format!("/api/v1/chats/{chat_id}/messages")
}

/// URL for the emoji shortcode registry.
pub fn emoji_registry_url() -> &'static str {
  "/api/v1/emoji"
}

/// Parse `GET /api/v1/emoji` into `(name, emoji)` pairs, preserving order.
///
/// This is the server-owned allowlist the htmx client renders against; the
/// egui client consumes it instead of carrying a second Rust copy.
pub fn parse_emoji_registry(raw: &str) -> Result<Vec<(String, String)>, String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  let data = value
    .get("data")
    .and_then(serde_json::Value::as_array)
    .ok_or("missing data array")?;
  let mut registry = Vec::with_capacity(data.len());
  for row in data {
    let (Some(name), Some(emoji)) = (
      row.get("name").and_then(serde_json::Value::as_str),
      row.get("emoji").and_then(serde_json::Value::as_str),
    ) else {
      continue;
    };
    registry.push((name.to_string(), emoji.to_string()));
  }
  Ok(registry)
}

/// URL for the assistant command registry.
///
/// When `chat_id` is given, the server additionally returns `roleInChat`
/// for role-gated display.
pub fn command_list_url(chat_id: Option<&str>) -> String {
  match chat_id {
    Some(id) => format!("/api/v1/commands?chatId={id}"),
    None => String::from("/api/v1/commands"),
  }
}

/// One command entry from the registry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandEntry {
  pub name: String,
  pub required_role: Option<String>,
}

/// Parse `GET /api/v1/commands` into command entries + optional role.
///
/// The server returns `{data: [{name, descriptionKey, requiredRole?}],
/// roleInChat?}`. `descriptionKey` is ignored (the egui client renders the
/// name only); `requiredRole` drives role-gated display.
pub fn parse_command_list(raw: &str) -> Result<(Vec<CommandEntry>, Option<String>), String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  let data = value
    .get("data")
    .and_then(serde_json::Value::as_array)
    .ok_or("missing data array")?;
  let mut entries = Vec::with_capacity(data.len());
  for row in data {
    let Some(name) = row.get("name").and_then(serde_json::Value::as_str) else {
      continue;
    };
    let required_role = row
      .get("requiredRole")
      .and_then(serde_json::Value::as_str)
      .map(String::from);
    entries.push(CommandEntry {
      name: name.to_string(),
      required_role,
    });
  }
  let role = value
    .get("roleInChat")
    .and_then(serde_json::Value::as_str)
    .map(String::from);
  Ok((entries, role))
}

/// Body for a user message; `serde_json` performs the escaping.
///
/// # Panics
///
/// Never — serializing this fixed shape cannot fail.
pub fn send_message_body(content: &str) -> String {
  #[derive(Serialize)]
  struct Body<'a> {
    content: &'a str,
    role: &'a str,
  }
  serde_json::to_string(&Body { content, role: "user" })
    .unwrap_or_else(|_| String::from("{\"content\":\"\",\"role\":\"user\"}"))
}

/// Extract the CSRF token from a `Cookie` header value.
///
/// The first `csrf_token=` segment wins; surrounding whitespace is ignored.
pub fn csrf_token_from_cookie_header(header: &str) -> Option<&str> {
  header.split(';').find_map(|segment| {
    let (name, value) = segment.trim().split_once('=')?;
    (name == "csrf_token").then(|| value.trim())
  })
}

/// Parse `GET /api/v1/chats` into chat rows, preserving order.
pub fn parse_chats_page(raw: &str) -> Result<Vec<ChatSummary>, String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  let data = value
    .get("data")
    .and_then(serde_json::Value::as_array)
    .ok_or("missing data array")?;
  let mut chats = Vec::with_capacity(data.len());
  for row in data {
    let Some(id) = row.get("id").and_then(serde_json::Value::as_str) else {
      continue;
    };
    chats.push(ChatSummary {
      id: id.to_string(),
      name: row.get("name").and_then(serde_json::Value::as_str).map(String::from),
      chat_type: row
        .get("type")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("direct")
        .to_string(),
      updated_at: row
        .get("updated_at")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string(),
    });
  }
  Ok(chats)
}

/// Parse `GET /api/v1/chats/:id/messages` into message rows, preserving order.
pub fn parse_messages_page(raw: &str) -> Result<Vec<ChatMessage>, String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  let data = value
    .get("data")
    .and_then(serde_json::Value::as_array)
    .ok_or("missing data array")?;
  let mut messages = Vec::with_capacity(data.len());
  for row in data {
    let (Some(id), Some(role)) = (
      row.get("id").and_then(serde_json::Value::as_str),
      row.get("role").and_then(serde_json::Value::as_str),
    ) else {
      continue;
    };
    messages.push(ChatMessage {
      id: id.to_string(),
      role: role.to_string(),
      content: row
        .get("content")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string(),
      created_at: row
        .get("created_at")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string(),
    });
  }
  Ok(messages)
}

/// Parse `POST /api/v1/chats/:id/messages` into the stored pair.
pub fn parse_sent_message(raw: &str) -> Result<SentMessage, String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  let message = parse_message_row(value.get("data").unwrap_or(&value))?;
  let assistant = value
    .get("assistantMessage")
    .and_then(|row| parse_message_row(row).ok());
  Ok(SentMessage { message, assistant })
}

/// Parse one message row from an already-decoded JSON value.
fn parse_message_row(row: &serde_json::Value) -> Result<ChatMessage, String> {
  let (Some(id), Some(role)) = (
    row.get("id").and_then(serde_json::Value::as_str),
    row.get("role").and_then(serde_json::Value::as_str),
  ) else {
    return Err("message missing id/role".to_string());
  };
  Ok(ChatMessage {
    id: id.to_string(),
    role: role.to_string(),
    content: row
      .get("content")
      .and_then(serde_json::Value::as_str)
      .unwrap_or_default()
      .to_string(),
    created_at: row
      .get("created_at")
      .and_then(serde_json::Value::as_str)
      .unwrap_or_default()
      .to_string(),
  })
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

/// Server-side page size of the gallery grid (`GRID_PAGE_SIZE` server-side).
pub(crate) const GALLERY_PAGE_SIZE: u32 = 200;

/// One gallery asset as the grid needs it — the JSON view-model seam
/// (`GET /dynamic/gallery/grid` with `Accept: application/json`), the same
/// rows the htmx fragment renders.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GalleryAsset {
  /// Asset id.
  pub id: String,
  /// File name.
  pub filename: String,
  /// `image` | `audio` | `video`.
  pub asset_type: String,
  /// Size in bytes.
  pub size_bytes: u64,
  /// Pre-computed size label.
  pub size_label: String,
  /// Thumbnail URL for images; `None` for other types.
  pub thumb_url: Option<String>,
  /// Visible tag names in query order.
  pub tags: Vec<String>,
  /// `public` | `private`.
  pub visibility: String,
  /// Raw `created_at` column.
  pub created_at: String,
}

/// URL for the gallery grid view-model page. `q` mirrors the htmx search input.
pub fn gallery_grid_url(page: u32, query: &str) -> String {
  if query.is_empty() {
    format!("/dynamic/gallery/grid?page={page}")
  } else {
    format!("/dynamic/gallery/grid?page={page}&q={query}")
  }
}

/// URL for the upload endpoint (multipart POST).
pub fn gallery_upload_url() -> &'static str {
  "/api/v1/assets"
}

/// URL for attaching an asset to a chat.
pub fn gallery_attach_url(asset_id: &str) -> String {
  format!("/api/v1/assets/{asset_id}/links")
}

/// Parse the gallery grid view-model into assets, preserving order.
///
/// The server returns `{assets: [{id, filename, assetType, sizeBytes,
/// sizeLabel, thumbUrl, tags, visibility, createdAt}]}`. `thumbUrl` is null
/// for non-images.
pub fn parse_gallery_grid(raw: &str) -> Result<Vec<GalleryAsset>, String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  let assets = value
    .get("assets")
    .and_then(|a| a.as_array())
    .ok_or_else(|| "gallery view-model has no assets array".to_string())?;
  let mut out = Vec::with_capacity(assets.len());
  for (index, row) in assets.iter().enumerate() {
    let asset = parse_gallery_row(row).map_err(|e| format!("asset {index}: {e}"))?;
    out.push(asset);
  }
  Ok(out)
}

fn parse_gallery_row(row: &serde_json::Value) -> Result<GalleryAsset, String> {
  let thumb = row.get("thumbUrl").and_then(|v| v.as_str());
  Ok(GalleryAsset {
    id: row
      .get("id")
      .and_then(|v| v.as_str())
      .ok_or("id missing")?
      .to_string(),
    filename: row
      .get("filename")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
    asset_type: row
      .get("assetType")
      .and_then(|v| v.as_str())
      .unwrap_or("image")
      .to_string(),
    size_bytes: row.get("sizeBytes").and_then(|v| v.as_u64()).unwrap_or(0),
    size_label: row
      .get("sizeLabel")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
    thumb_url: if thumb.map_or(true, |u| u.is_empty()) {
      None
    } else {
      thumb.map(String::from)
    },
    tags: row
      .get("tags")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr.iter()
          .filter_map(|t| t.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default(),
    visibility: row
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("public")
      .to_string(),
    created_at: row
      .get("createdAt")
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .to_string(),
  })
}

/// Body for attaching an asset to a chat; `serde_json` performs the escaping.
pub fn gallery_attach_body(chat_id: &str) -> String {
  serde_json::json!({ "entityType": "chat", "entityId": chat_id }).to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn list_urls_carry_page_and_size() {
    assert_eq!(chats_list_url(1), "/api/v1/chats?page=1&pageSize=50");
    assert_eq!(messages_url("c1", 2), "/api/v1/chats/c1/messages?page=2&pageSize=50");
    assert_eq!(send_message_url("c1"), "/api/v1/chats/c1/messages");
  }

  #[test]
  fn send_body_is_json_with_user_role() {
    let body = send_message_body("he said \"hi\"");
    let value: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(value["role"], "user");
    assert_eq!(value["content"], "he said \"hi\"");
  }

  #[test]
  fn csrf_token_extracted_from_cookie_header() {
    assert_eq!(csrf_token_from_cookie_header("a=1; csrf_token=xyz; b=2"), Some("xyz"));
    assert_eq!(csrf_token_from_cookie_header("csrf_token=xyz"), Some("xyz"));
    assert_eq!(csrf_token_from_cookie_header("session=abc"), None);
    assert_eq!(csrf_token_from_cookie_header(""), None);
  }

  #[test]
  fn chats_page_parses_rows_in_order() {
    let raw = r#"{"data":[{"id":"c1","name":"Tale","type":"group","updated_at":"t1"},{"id":"c2","name":null}],"total":2,"page":1,"pageSize":50}"#;
    let chats = parse_chats_page(raw).unwrap();
    assert_eq!(chats.len(), 2);
    assert_eq!(chats[0].label(), "Tale");
    assert_eq!(chats[1].name, None);
    assert_eq!(chats[1].label(), "(unnamed chat)");
    assert_eq!(chats[1].chat_type, "direct");
  }

  #[test]
  fn chats_page_rejects_non_json_and_missing_data() {
    assert!(parse_chats_page("nope").is_err());
    assert!(parse_chats_page("{\"total\":0}").is_err());
  }

  #[test]
  fn chats_page_skips_rows_without_id() {
    let raw = r#"{"data":[{"name":"no id"},{"id":"c1"}]}"#;
    let chats = parse_chats_page(raw).unwrap();
    assert_eq!(chats.len(), 1);
    assert_eq!(chats[0].id, "c1");
  }

  #[test]
  fn messages_page_parses_rows_in_order() {
    let raw = r#"{"data":[{"id":"m1","role":"user","content":"hi","created_at":"t"},{"id":"m2","role":"assistant","content":"yo"}],"total":2}"#;
    let messages = parse_messages_page(raw).unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].content, "hi");
    assert_eq!(messages[1].created_at, "");
  }

  #[test]
  fn messages_page_skips_rows_without_id_or_role() {
    let raw = r#"{"data":[{"id":"m1"},{"role":"user"},{"id":"m3","role":"user","content":"ok"}]}"#;
    let messages = parse_messages_page(raw).unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].id, "m3");
  }

  #[test]
  fn sent_message_parses_pair_and_optional_reply() {
    let raw =
      r#"{"id":"m1","role":"user","content":"hi","assistantMessage":{"id":"m2","role":"assistant","content":"yo"}}"#;
    let sent = parse_sent_message(raw).unwrap();
    assert_eq!(sent.message.id, "m1");
    assert_eq!(sent.assistant.unwrap().content, "yo");
  }

  #[test]
  fn sent_message_without_reply_parses() {
    let raw = r#"{"data":{"id":"m1","role":"user","content":"hi"}}"#;
    let sent = parse_sent_message(raw).unwrap();
    assert_eq!(sent.message.id, "m1");
    assert!(sent.assistant.is_none());
  }

  #[test]
  fn sent_message_rejects_garbage() {
    assert!(parse_sent_message("nope").is_err());
    assert!(parse_sent_message("{\"role\":\"user\"}").is_err());
  }

  #[test]
  fn emoji_registry_parses_pairs_in_order() {
    let raw = r#"{"data":[{"name":"fire","emoji":"F"},{"name":"heart","emoji":"H"},{"emoji":"y"}]}"#;
    let registry = parse_emoji_registry(raw).unwrap();
    assert_eq!(registry.len(), 2);
    assert_eq!(registry[0].0, "fire");
    assert_eq!(registry[1].0, "heart");
  }

  #[test]
  fn emoji_registry_rejects_garbage() {
    assert!(parse_emoji_registry("nope").is_err());
    assert!(parse_emoji_registry("{\"data\":\"x\"}").is_err());
  }

  #[test]
  fn command_list_url_with_chat_appends_query() {
    assert_eq!(command_list_url(Some("c1")), "/api/v1/commands?chatId=c1");
    assert_eq!(command_list_url(None), "/api/v1/commands");
  }

  #[test]
  fn command_list_parses_entries_and_role() {
    let raw = r#"{"data":[{"name":"roll","descriptionKey":"commands.roll"},{"name":"guide","requiredRole":"owner"},{"name":"stats","requiredRole":"member"}],"roleInChat":"member"}"#;
    let (entries, role) = parse_command_list(raw).unwrap();
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].name, "roll");
    assert_eq!(entries[0].required_role, None);
    assert_eq!(entries[1].required_role.as_deref(), Some("owner"));
    assert_eq!(role.as_deref(), Some("member"));
  }

  #[test]
  fn command_list_without_role_returns_none() {
    let raw = r#"{"data":[{"name":"roll"}]}"#;
    let (entries, role) = parse_command_list(raw).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(role, None);
  }

  #[test]
  fn command_list_rejects_garbage() {
    assert!(parse_command_list("nope").is_err());
    assert!(parse_command_list("{\"data\":\"x\"}").is_err());
  }

  #[test]
  fn gallery_urls_carry_page_query_and_ids() {
    assert_eq!(gallery_grid_url(1, ""), "/dynamic/gallery/grid?page=1");
    assert_eq!(gallery_grid_url(3, "cat"), "/dynamic/gallery/grid?page=3&q=cat");
    assert_eq!(gallery_upload_url(), "/api/v1/assets");
    assert_eq!(gallery_attach_url("a1"), "/api/v1/assets/a1/links");
    assert_eq!(gallery_attach_body("c1"), "{\"entityId\":\"c1\",\"entityType\":\"chat\"}");
  }

  #[test]
  fn gallery_grid_parses_view_model_in_order() {
    let raw = r#"{"assets":[
      {"id":"a1","filename":"cat.png","assetType":"image","sizeBytes":2048,"sizeLabel":"2.0 KB","thumbUrl":"/api/v1/assets/a1/thumb","tags":["pet"],"visibility":"public","createdAt":"2026-10-01"},
      {"id":"a2","filename":"voice.mp3","assetType":"audio","sizeBytes":1048576,"sizeLabel":"1.0 MB","thumbUrl":null,"tags":[],"visibility":"private","createdAt":"2026-10-02"}
    ]}"#;
    let assets = parse_gallery_grid(raw).unwrap();
    assert_eq!(assets.len(), 2);
    assert_eq!(assets[0].id, "a1");
    assert_eq!(assets[0].thumb_url.as_deref(), Some("/api/v1/assets/a1/thumb"));
    assert_eq!(assets[0].tags, vec!["pet"]);
    assert_eq!(assets[0].size_label, "2.0 KB");
    assert_eq!(assets[1].id, "a2");
    assert_eq!(assets[1].thumb_url, None);
    assert_eq!(assets[1].visibility, "private");
  }

  #[test]
  fn gallery_grid_defaults_and_rejects_garbage() {
    let minimal = r#"{"assets":[{"id":"a1"}]}"#;
    let assets = parse_gallery_grid(minimal).unwrap();
    assert_eq!(assets[0].filename, "");
    assert_eq!(assets[0].asset_type, "image");
    assert_eq!(assets[0].size_bytes, 0);
    assert_eq!(assets[0].tags.len(), 0);
    assert_eq!(assets[0].visibility, "public");
    assert!(parse_gallery_grid("nope").is_err());
    assert!(parse_gallery_grid("{\"assets\":\"x\"}").is_err());
    assert!(parse_gallery_grid("{\"assets\":[{\"noId\":1}]}").is_err());
  }
}
