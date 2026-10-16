//! Browser-side transfer context shared with the htmx/Alpine frontend.
//!
//! The contract lives in exactly two places — this module and
//! `src/frontend/egui-bridge.ts` — and both sides must agree on the storage
//! key, the JSON field names, and the fallback rules.

use serde::{Deserialize, Serialize};

/// `localStorage` key both frontends read and write.
///
/// MUST stay in lockstep with `EGUI_CONTEXT_KEY` in `src/frontend/egui-bridge.ts`.
pub const CONTEXT_STORAGE_KEY: &str = "loop-lore.egui-context.v1";

/// Schema version. A stored payload with any other version is discarded.
pub const CONTEXT_VERSION: u32 = 1;

/// htmx landing path when no `return_to` was stored.
pub const DEFAULT_RETURN_TO: &str = "/views/chat";

/// The transfer context: which chat is active and where htmx land on return.
///
/// Field names are camelCase on the wire — the TS side has no rename layer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendContext {
  /// Schema version; see [`CONTEXT_VERSION`].
  pub version: u32,
  /// Chat the user was last in, when known.
  pub active_chat_id: Option<String>,
  /// Origin-absolute htmx path to return to.
  pub return_to: String,
}

impl Default for FrontendContext {
  fn default() -> Self {
    Self {
      version: CONTEXT_VERSION,
      active_chat_id: None,
      return_to: DEFAULT_RETURN_TO.to_string(),
    }
  }
}

impl FrontendContext {
  /// Build a context for the current chat and the htmx page it came from.
  pub fn new(active_chat_id: Option<String>, return_to: impl Into<String>) -> Self {
    Self {
      version: CONTEXT_VERSION,
      active_chat_id,
      return_to: return_to.into(),
    }
  }

  /// Serialize for `localStorage`.
  ///
  /// Serialization of this struct cannot fail; the fallback exists so the
  /// function is total and callers never see an `Err`.
  pub fn to_json(&self) -> String {
    serde_json::to_string(self)
      .unwrap_or_else(|_| serde_json::to_string(&Self::default()).unwrap_or_else(|_| String::from("{}")))
  }

  /// Parse a stored payload.
  ///
  /// Malformed JSON, missing fields, a differing [`CONTEXT_VERSION`], or
  /// non-string values all fall back to [`FrontendContext::default`] — a
  /// corrupt context must never block the transfer.
  ///
  /// `return_to` MUST be an origin-absolute same-origin path: a scheme-relative
  /// `//host` value would navigate the user off-origin. Mirrors the guard in
  /// `src/frontend/egui-bridge.ts`; both sides must agree.
  pub fn from_stored_json(raw: &str) -> Self {
    match serde_json::from_str::<Self>(raw) {
      Ok(ctx)
        if ctx.version == CONTEXT_VERSION && ctx.return_to.starts_with('/') && !ctx.return_to.starts_with("//") =>
      {
        ctx
      }
      _ => Self::default(),
    }
  }

  /// The htmx chat URL for the active chat, or the bare chat list.
  pub fn htmx_chat_url(&self) -> String {
    match &self.active_chat_id {
      Some(id) => format!("{DEFAULT_RETURN_TO}?chatid={id}"),
      None => DEFAULT_RETURN_TO.to_string(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn round_trip_preserves_fields() {
    let ctx = FrontendContext::new(Some("chat-1".into()), "/views/chat?chatid=chat-1");
    assert_eq!(FrontendContext::from_stored_json(&ctx.to_json()), ctx);
  }

  #[test]
  fn serialized_field_names_are_camel_case() {
    let json = FrontendContext::new(None, DEFAULT_RETURN_TO).to_json();
    assert!(json.contains("\"activeChatId\""), "{json}");
    assert!(json.contains("\"returnTo\""), "{json}");
    assert!(json.contains("\"version\""), "{json}");
  }

  #[test]
  fn malformed_json_falls_back_to_defaults() {
    assert_eq!(
      FrontendContext::from_stored_json("not json"),
      FrontendContext::default()
    );
    assert_eq!(FrontendContext::from_stored_json(""), FrontendContext::default());
  }

  #[test]
  fn wrong_version_is_discarded() {
    let raw = r#"{"version":99,"activeChatId":"c","returnTo":"/views/chat"}"#;
    assert_eq!(FrontendContext::from_stored_json(raw), FrontendContext::default());
  }

  #[test]
  fn off_origin_return_to_is_discarded() {
    // Scheme-relative `//host` and any non-path value would navigate the user
    // off-origin — the TS bridge rejects the same shapes.
    for raw in [
      r#"{"version":1,"activeChatId":null,"returnTo":"//evil.example"}"#,
      r#"{"version":1,"activeChatId":null,"returnTo":"https://evil.example"}"#,
      r#"{"version":1,"activeChatId":null,"returnTo":"views/chat"}"#,
    ] {
      assert_eq!(
        FrontendContext::from_stored_json(raw),
        FrontendContext::default(),
        "{raw}"
      );
    }

    // Same-origin absolute paths (with query) survive.
    let raw = r#"{"version":1,"activeChatId":"c","returnTo":"/views/chat?chatid=c"}"#;
    let ctx = FrontendContext::from_stored_json(raw);
    assert_eq!(ctx.return_to, "/views/chat?chatid=c");
    assert_eq!(ctx.active_chat_id.as_deref(), Some("c"));
  }

  #[test]
  fn missing_fields_fall_back_to_defaults() {
    // `version` present but the context fields absent — serde requires them,
    // so the whole payload is discarded rather than half-parsed.
    let raw = r#"{"version":1}"#;
    assert_eq!(FrontendContext::from_stored_json(raw), FrontendContext::default());
  }

  #[test]
  fn htmx_chat_url_carries_the_active_chat() {
    let ctx = FrontendContext::new(Some("abc".into()), DEFAULT_RETURN_TO);
    assert_eq!(ctx.htmx_chat_url(), "/views/chat?chatid=abc");
    assert_eq!(FrontendContext::default().htmx_chat_url(), "/views/chat");
  }
}
