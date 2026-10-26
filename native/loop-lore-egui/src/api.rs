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
///
/// The 201 envelope is not uniform: a replied send nests the assistant row
/// under `assistantMessage` and echoes no user row at all (see
/// `message-vectors.json`), so both members are optional.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SentMessage {
  /// The stored user message, when the envelope carried one.
  pub message: Option<ChatMessage>,
  /// The assistant auto-reply, when the server produced one.
  pub assistant: Option<ChatMessage>,
}

/// URL for the chat list page.
pub fn chats_list_url(page: u32) -> String {
  format!("/api/v1/chats?page={page}&pageSize={PAGE_SIZE}")
}

/// URL for one chat's message page.
pub fn messages_url(chat_id: &str, page: u32) -> String {
  format!(
    "/api/v1/chats/{}/messages?page={page}&pageSize={PAGE_SIZE}",
    encode_url_component(chat_id)
  )
}

/// URL for the send endpoint.
pub fn send_message_url(chat_id: &str) -> String {
  format!("/api/v1/chats/{}/messages", encode_url_component(chat_id))
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
    Some(id) => format!("/api/v1/commands?chatId={}", encode_url_component(id)),
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

/// One page of `GET /api/v1/chats/:id/messages` plus the paging the server
/// reported.
///
/// The route answers `jsonPaginated`, which nests its metadata under
/// `pagination` (`src/routes/http-utils/responses.ts`); there is no top-level
/// `total`/`totalPages` in that envelope, so only the nested shape is read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessagesPage {
  /// Rows in server order — oldest first.
  pub messages: Vec<ChatMessage>,
  /// How many pages the chat holds; `1` when the envelope carries no paging,
  /// so a caller that reads only page 1 is still reading the last page.
  pub total_pages: u32,
}

/// Parse `GET /api/v1/chats/:id/messages` into rows plus the page count.
pub fn parse_messages_page(raw: &str) -> Result<MessagesPage, String> {
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
  // The metadata lives under `pagination`; an empty chat reports
  // `totalPages: 0` and a body without paging reports nothing at all. Both
  // mean "page 1 is the last page", which is what the caller needs.
  let total_pages = value
    .get("pagination")
    .and_then(|pagination| pagination.get("totalPages"))
    .and_then(serde_json::Value::as_u64)
    .and_then(|pages| u32::try_from(pages).ok())
    .unwrap_or(0)
    .max(1);
  Ok(MessagesPage { messages, total_pages })
}

/// Parse `POST /api/v1/chats/:id/messages` into whatever rows it echoed.
///
/// The 201 envelope (`src/routes/messages/create-response.ts`) is not
/// uniform — `message-vectors.json` pins all three real shapes:
///
/// - `{id, context, meta}` — a non-replied send echoes the user row;
/// - `{assistantMessage, context, meta}` — the assistant row, nothing else;
/// - `{context, meta}` — no rows at all (a replied send whose generation
///   body carried none).
///
/// Roles are inferred from position rather than required: the top-level row
/// on a send is the caller's own message and `assistantMessage` is the
/// assistant's by construction. Only non-JSON and non-object bodies are
/// errors; a missing row is not, because the server legitimately sends none.
pub fn parse_sent_message(raw: &str) -> Result<SentMessage, String> {
  let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
  if !value.is_object() {
    return Err(String::from("send response is not an object"));
  }
  let row = value.get("data").filter(|data| data.is_object()).unwrap_or(&value);
  // A top-level {id, context, meta} envelope carries no message content —
  // the send shape, not a message row. Rendering it yields an empty bubble,
  // so treat a content-less row as absent (the stream delivers the reply).
  let message = parse_message_row(row, "user")
    .ok()
    .filter(|message| !message.content.is_empty());
  let assistant = value
    .get("assistantMessage")
    .and_then(|row| parse_message_row(row, "assistant").ok());
  Ok(SentMessage { message, assistant })
}

/// Parse one message row from an already-decoded JSON value.
///
/// `fallback_role` applies when the row omits `role`, which the send
/// envelope always does.
fn parse_message_row(row: &serde_json::Value, fallback_role: &str) -> Result<ChatMessage, String> {
  let Some(id) = row.get("id").and_then(serde_json::Value::as_str) else {
    return Err(String::from("message missing id"));
  };
  Ok(ChatMessage {
    id: id.to_string(),
    role: row
      .get("role")
      .and_then(serde_json::Value::as_str)
      .unwrap_or(fallback_role)
      .to_string(),
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
///
/// The fallback for a response that omits `pageSize`; a response that reports
/// its own row window wins (`GalleryPage::page_size`).
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

/// One page of gallery rows plus the paging the server reported.
///
/// Both gallery endpoints answer with `{ assets, page, pageSize }`: `page` is
/// the page the server served, `pageSize` the row window it applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GalleryPage {
  /// The asset rows, in display order.
  pub assets: Vec<GalleryAsset>,
  /// The 1-based page the server served.
  pub page: u32,
  /// The number of rows the server's page window holds.
  pub page_size: u32,
}

/// Gallery grid filters — the same params the htmx filter bar sends to
/// `/dynamic/gallery/search` (`src/components/filter-bar.html`): free-text
/// `q`, asset `type`, visible-`tag` facet, and `sort`. Row visibility itself
/// is authz, always applied server-side by `applyGalleryAssetFilters`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GalleryFilters {
  /// Free-text filename query (`q`).
  pub query: String,
  /// Asset type (`all` | `image` | `audio` | `video`).
  pub asset_type: String,
  /// Visible-tag facet (`all` = no facet).
  pub tag: String,
  /// Sort order (`name` | `newest` | `oldest`).
  pub sort: String,
}

impl GalleryFilters {
  /// `true` when no filter is set — the grid endpoint serves the page as-is.
  /// Dropdown defaults (`all`, `name`) count as unset, so untouched controls
  /// keep hitting the grid endpoint instead of the search one.
  pub fn is_empty(&self) -> bool {
    self.query.is_empty()
      && (self.asset_type.is_empty() || self.asset_type == "all")
      && (self.tag.is_empty() || self.tag == "all")
      && (self.sort.is_empty() || self.sort == "name")
  }

  /// Query string for the dynamic endpoints; defaults (`all`, `name`) omitted.
  fn params(&self, page: u32) -> String {
    use std::fmt::Write;
    let mut out = format!("page={page}");
    if !self.query.is_empty() {
      let _ = write!(out, "&q={}", encode_url_component(&self.query));
    }
    if !self.asset_type.is_empty() && self.asset_type != "all" {
      let _ = write!(out, "&type={}", encode_url_component(&self.asset_type));
    }
    if !self.tag.is_empty() && self.tag != "all" {
      let _ = write!(out, "&tag={}", encode_url_component(&self.tag));
    }
    if !self.sort.is_empty() && self.sort != "name" {
      let _ = write!(out, "&sort={}", encode_url_component(&self.sort));
    }
    out
  }
}

/// Percent-encode one URL component — a query value or a path segment.
///
/// Filters are user-typed (`q` free text) or come from tag names, and chat and
/// asset ids come from the persisted context, so neither may reach a URL raw:
/// `cat & dog` truncates at the `&`, `#` starts the fragment, and an id shaped
/// `../../admin` walks out of its own path. The pass-through set is exactly
/// `encodeURIComponent`'s (unreserved plus `! ' ( ) *`), so this client and
/// the htmx twin's `encodeURIComponent` calls escape identically.
///
/// No dependency: `percent-encoding` would cost a build for ~12 lines.
pub(crate) fn encode_url_component(value: &str) -> String {
  use std::fmt::Write;
  let mut out = String::with_capacity(value.len());
  for byte in value.bytes() {
    let unreserved =
      byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'!' | b'\'' | b'(' | b')' | b'*');
    if unreserved {
      out.push(byte as char);
    } else {
      out.push('%');
      let _ = write!(out, "{byte:02X}");
    }
  }
  out
}

/// URL for the gallery grid view-model page.
///
/// Unfiltered pages come from `/dynamic/gallery/grid`; any filter switches to
/// `/dynamic/gallery/search`, mirroring the htmx page (grid on load, search
/// on filter input).
pub fn gallery_grid_url(page: u32, filters: &GalleryFilters) -> String {
  if filters.is_empty() {
    format!("/dynamic/gallery/grid?page={page}")
  } else {
    format!("/dynamic/gallery/search?{}", filters.params(page))
  }
}

/// URL for attaching an asset to a chat.
///
/// Rust owns the attach request (see `EguiApp::attach_asset`); only upload and
/// thumbnail decode cross the bridge, because both need browser-only APIs.
pub fn gallery_attach_url(asset_id: &str) -> String {
  format!("/api/v1/assets/{}/links", encode_url_component(asset_id))
}

/// Parse a gallery page view-model into rows plus the paging the server reported.
///
/// The server returns `{assets: [{id, filename, assetType, sizeBytes,
/// sizeLabel, thumbUrl, tags, visibility, createdAt}], page, pageSize}` for
/// both `/dynamic/gallery/grid` and `/dynamic/gallery/search`. `thumbUrl` is
/// null for non-images.
///
/// `page` echoes the request, so a response that omits it falls back to
/// `requested_page` — the page the client asked for — rather than rewinding
/// the pager to page 1.
pub fn parse_gallery_page(raw: &str, requested_page: u32) -> Result<GalleryPage, String> {
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
  let page = value
    .get("page")
    .and_then(serde_json::Value::as_u64)
    .and_then(|page| u32::try_from(page).ok())
    .filter(|page| *page >= 1)
    .unwrap_or_else(|| requested_page.max(1));
  let page_size = value
    .get("pageSize")
    .and_then(serde_json::Value::as_u64)
    .and_then(|size| u32::try_from(size).ok())
    .filter(|size| *size > 0)
    .unwrap_or(GALLERY_PAGE_SIZE);
  Ok(GalleryPage {
    assets: out,
    page,
    page_size,
  })
}

fn parse_gallery_row(row: &serde_json::Value) -> Result<GalleryAsset, String> {
  let thumb = row.get("thumbUrl").and_then(|v| v.as_str());
  Ok(GalleryAsset {
    id: row.get("id").and_then(|v| v.as_str()).ok_or("id missing")?.to_string(),
    filename: row.get("filename").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    asset_type: row
      .get("assetType")
      .and_then(|v| v.as_str())
      .unwrap_or("image")
      .to_string(),
    size_bytes: row.get("sizeBytes").and_then(serde_json::Value::as_u64).unwrap_or(0),
    size_label: row.get("sizeLabel").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    thumb_url: if thumb.is_none_or(str::is_empty) {
      None
    } else {
      thumb.map(String::from)
    },
    tags: row
      .get("tags")
      .and_then(|v| v.as_array())
      .map(|arr| arr.iter().filter_map(|t| t.as_str().map(String::from)).collect())
      .unwrap_or_default(),
    visibility: row
      .get("visibility")
      .and_then(|v| v.as_str())
      .unwrap_or("public")
      .to_string(),
    created_at: row.get("createdAt").and_then(|v| v.as_str()).unwrap_or("").to_string(),
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
  fn messages_page_parses_rows_and_nested_paging() {
    // The real `jsonPaginated` envelope: the metadata lives under `pagination`
    // (`src/routes/http-utils/responses.ts`), and rows come oldest-first.
    let raw = r#"{"data":[{"id":"m1","role":"user","content":"hi","created_at":"t"},{"id":"m2","role":"assistant","content":"yo"}],"pagination":{"total":250,"page":1,"pageSize":50,"totalPages":5},"meta":{}}"#;
    let page = parse_messages_page(raw).unwrap();
    assert_eq!(page.messages.len(), 2);
    assert_eq!(page.messages[0].content, "hi");
    assert_eq!(page.messages[1].created_at, "");
    assert_eq!(page.total_pages, 5, "the client re-reads this page number last");
  }

  #[test]
  fn messages_page_skips_rows_without_id_or_role() {
    let raw = r#"{"data":[{"id":"m1"},{"role":"user"},{"id":"m3","role":"user","content":"ok"}],"pagination":{"total":1,"page":1,"pageSize":50,"totalPages":1}}"#;
    let page = parse_messages_page(raw).unwrap();
    assert_eq!(page.messages.len(), 1);
    assert_eq!(page.messages[0].id, "m3");
  }

  /// A top-level `total`/`totalPages` is NOT part of the server's envelope, so
  /// promoting it would invent pages the chat does not have and send the
  /// client to a page that does not exist. Only `pagination` counts.
  #[test]
  fn messages_page_reads_only_the_nested_pagination() {
    let phantom = parse_messages_page(r#"{"data":[],"total":2}"#).unwrap();
    assert_eq!(phantom.total_pages, 1);
    // An empty chat reports `totalPages: 0`; page 1 is its last page either way.
    let empty =
      parse_messages_page(r#"{"data":[],"pagination":{"total":0,"page":1,"pageSize":50,"totalPages":0}}"#).unwrap();
    assert_eq!(empty.total_pages, 1);
    assert_eq!(empty.messages.len(), 0);
  }

  /// The shared conformance vectors: `message-vectors.json` holds the real
  /// 201 bodies `src/routes/messages/create-response.test.ts` asserts, so a
  /// server-side envelope change fails this suite until the parser follows.
  #[derive(serde::Deserialize)]
  struct MessageVectors {
    sent: Vec<SentCase>,
  }

  #[derive(serde::Deserialize)]
  struct SentCase {
    name: String,
    body: serde_json::Value,
    expected: SentExpectation,
  }

  #[derive(serde::Deserialize)]
  struct SentExpectation {
    message: Option<ExpectedMessage>,
    assistant: Option<ExpectedMessage>,
  }

  #[derive(serde::Deserialize)]
  struct ExpectedMessage {
    id: String,
    role: String,
    content: String,
    created_at: String,
  }

  impl ExpectedMessage {
    fn to_message(&self) -> ChatMessage {
      ChatMessage {
        id: self.id.clone(),
        role: self.role.clone(),
        content: self.content.clone(),
        created_at: self.created_at.clone(),
      }
    }
  }

  fn sent_vectors() -> MessageVectors {
    serde_json::from_str(include_str!("../message-vectors.json")).expect("message-vectors.json is valid")
  }

  #[test]
  fn sent_message_parses_every_real_server_envelope() {
    let vectors = sent_vectors();
    let names: Vec<&str> = vectors.sent.iter().map(|case| case.name.as_str()).collect();
    assert_eq!(
      names,
      vec![
        "no_reply",
        "reply_with_assistant_message",
        "reply_without_any_message_row"
      ],
      "the fixture must pin every 201 shape the server sends"
    );
    for case in &vectors.sent {
      let sent = parse_sent_message(&case.body.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case.name));
      let expected_user = case.expected.message.as_ref().map(ExpectedMessage::to_message);
      let expected_assistant = case.expected.assistant.as_ref().map(ExpectedMessage::to_message);
      assert_eq!(sent.message, expected_user, "{}: user row", case.name);
      assert_eq!(sent.assistant, expected_assistant, "{}: assistant row", case.name);
    }
  }

  #[test]
  fn sent_message_infers_roles_from_position() {
    let raw = r#"{"data":{"id":"m1","content":"hi"}}"#;
    let sent = parse_sent_message(raw).unwrap();
    let message = sent.message.expect("the data row is the caller's own");
    assert_eq!(message.role, "user");
    assert_eq!(message.content, "hi");
    assert!(sent.assistant.is_none());
  }

  #[test]
  fn sent_message_rejects_garbage() {
    assert!(parse_sent_message("nope").is_err());
    assert!(parse_sent_message("[1,2]").is_err());
    // No row at all is a legitimate envelope, not an error.
    let sent = parse_sent_message(r#"{"context":{},"meta":{}}"#).unwrap();
    assert!(sent.message.is_none());
    assert!(sent.assistant.is_none());
  }

  #[test]
  fn ids_are_percent_encoded_into_urls() {
    // A traversal-shaped id cannot escape its own path or query segment.
    assert_eq!(
      messages_url("../../admin", 1),
      "/api/v1/chats/..%2F..%2Fadmin/messages?page=1&pageSize=50"
    );
    assert_eq!(
      send_message_url("../../admin"),
      "/api/v1/chats/..%2F..%2Fadmin/messages"
    );
    assert_eq!(
      command_list_url(Some("../../admin")),
      "/api/v1/commands?chatId=..%2F..%2Fadmin"
    );
    assert_eq!(
      gallery_attach_url("../assets/1"),
      "/api/v1/assets/..%2Fassets%2F1/links"
    );
    // Ordinary ids stay readable, and encodeURIComponent's pass-through set
    // (unreserved plus `!'()*`) survives untouched.
    assert_eq!(
      messages_url("chat-1", 2),
      "/api/v1/chats/chat-1/messages?page=2&pageSize=50"
    );
    assert_eq!(encode_url_component("a b/c?d#e'f"), "a%20b%2Fc%3Fd%23e'f");
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
    assert_eq!(
      gallery_grid_url(1, &GalleryFilters::default()),
      "/dynamic/gallery/grid?page=1"
    );
    let filtered = GalleryFilters {
      query: "cat".to_string(),
      asset_type: "image".to_string(),
      tag: "all".to_string(),
      sort: "newest".to_string(),
    };
    assert_eq!(
      gallery_grid_url(3, &filtered),
      "/dynamic/gallery/search?page=3&q=cat&type=image&sort=newest"
    );
    // Dropdown defaults count as unset — untouched controls hit the grid.
    let defaults = GalleryFilters {
      query: String::new(),
      asset_type: "all".to_string(),
      tag: "all".to_string(),
      sort: "name".to_string(),
    };
    assert!(defaults.is_empty());
    assert_eq!(gallery_grid_url(1, &defaults), "/dynamic/gallery/grid?page=1");
    assert_eq!(gallery_attach_url("a1"), "/api/v1/assets/a1/links");
    let body = gallery_attach_body("c1");
    let value: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(value["entityType"], "chat");
    assert_eq!(value["entityId"], "c1");
  }

  #[test]
  fn gallery_url_encodes_user_input() {
    let filters = GalleryFilters {
      query: "cat & dog".to_string(),
      asset_type: "image".to_string(),
      tag: "café#1".to_string(),
      sort: "newest".to_string(),
    };
    assert_eq!(
      gallery_grid_url(1, &filters),
      "/dynamic/gallery/search?page=1&q=cat%20%26%20dog&type=image&tag=caf%C3%A9%231&sort=newest"
    );
    // Unreserved characters stay readable.
    assert_eq!(encode_url_component("a-b_c.d~e"), "a-b_c.d~e");
  }

  #[test]
  fn gallery_grid_parses_view_model_in_order() {
    let raw = r#"{"assets":[
      {"id":"a1","filename":"cat.png","assetType":"image","sizeBytes":2048,"sizeLabel":"2.0 KB","thumbUrl":"/api/v1/assets/a1/thumb","tags":["pet"],"visibility":"public","createdAt":"2026-10-01"},
      {"id":"a2","filename":"voice.mp3","assetType":"audio","sizeBytes":1048576,"sizeLabel":"1.0 MB","thumbUrl":null,"tags":[],"visibility":"private","createdAt":"2026-10-02"}
    ]}"#;
    let page = parse_gallery_page(raw, 1).unwrap();
    assert_eq!(page.assets.len(), 2);
    assert_eq!(page.assets[0].id, "a1");
    assert_eq!(page.assets[0].thumb_url.as_deref(), Some("/api/v1/assets/a1/thumb"));
    assert_eq!(page.assets[0].tags, vec!["pet"]);
    assert_eq!(page.assets[0].size_label, "2.0 KB");
    assert_eq!(page.assets[1].id, "a2");
    assert_eq!(page.assets[1].thumb_url, None);
    assert_eq!(page.assets[1].visibility, "private");
  }

  #[test]
  fn gallery_grid_defaults_and_rejects_garbage() {
    let minimal = r#"{"assets":[{"id":"a1"}]}"#;
    let page = parse_gallery_page(minimal, 1).unwrap();
    assert_eq!(page.assets[0].filename, "");
    assert_eq!(page.assets[0].asset_type, "image");
    assert_eq!(page.assets[0].size_bytes, 0);
    assert_eq!(page.assets[0].tags.len(), 0);
    assert_eq!(page.assets[0].visibility, "public");
    assert!(parse_gallery_page("nope", 1).is_err());
    assert!(parse_gallery_page("{\"assets\":\"x\"}", 1).is_err());
    assert!(parse_gallery_page("{\"assets\":[{\"noId\":1}]}", 1).is_err());
  }

  #[test]
  fn gallery_page_reads_the_paging_the_server_reported() {
    // Owns its own JSON literals only — no shared resource, no ordering
    // dependency.
    let raw = r#"{"assets":[{"id":"a1"}],"page":3,"pageSize":50}"#;
    let page = parse_gallery_page(raw, 3).unwrap();
    assert_eq!(page.page, 3);
    assert_eq!(page.page_size, 50);
    // A response without `page` falls back to the page the client asked for —
    // rewinding the pager to page 1 would re-append the same rows.
    let no_page = parse_gallery_page(r#"{"assets":[{"id":"a1"}]}"#, 4).unwrap();
    assert_eq!(no_page.page, 4);
    assert_eq!(no_page.page_size, GALLERY_PAGE_SIZE);
    // A nonsense window falls back to the server's grid page size.
    let no_size = parse_gallery_page(r#"{"assets":[{"id":"a1"}],"pageSize":0}"#, 1).unwrap();
    assert_eq!(no_size.page_size, GALLERY_PAGE_SIZE);
  }
}
