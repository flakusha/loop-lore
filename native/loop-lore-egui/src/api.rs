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
}
