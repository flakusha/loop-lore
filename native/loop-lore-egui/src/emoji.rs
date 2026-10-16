//! Emoji shortcode rendering and autocomplete — mirrors the htmx/Alpine
//! client (`src/frontend/alpine/chat-utils/emoji.ts` and
//! `emoji-autocomplete.ts`) so both clients produce identical output.
//!
//! The shared conformance vectors live in `emoji-vectors.json` at the crate
//! root; both the Rust tests and the TS tests read the same file.

#[cfg(test)]
use serde::Deserialize;
#[cfg(test)]
use std::sync::LazyLock;

/// A caret-anchored emoji token found in text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaretToken {
  /// Byte index where the full match starts (including leading whitespace).
  pub match_start: usize,
  /// Byte index where the query starts (after the `:`).
  pub query_start: usize,
  /// Byte length of the query (without the `:`).
  pub query_len: usize,
}

/// Check if a byte is a valid shortcode name character (case-sensitive).
fn is_shortcode_char(b: u8) -> bool {
  b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'+' || b == b'-'
}

/// Check if a byte is a valid autocomplete query character (case-insensitive).
fn is_query_char(b: u8) -> bool {
  b.is_ascii_alphabetic() || b.is_ascii_digit() || b == b'_' || b == b'+' || b == b'-'
}

/// Replace `:shortcode:` tokens with emoji, exempting inline code spans.
///
/// Mirrors `renderShortcodes` in the htmx client: split on `` `[^`]*` ``,
/// replace `:name:` (case-sensitive) in non-code parts, leave unknown codes
/// literal.
pub fn render_shortcodes(text: &str, registry: &[(String, String)]) -> String {
  let mut result = String::with_capacity(text.len());
  let mut rest = text;

  while let Some(start) = rest.find('`') {
    if let Some(end) = rest[start + 1..].find('`') {
      let end = start + 1 + end;
      result.push_str(&replace_shortcodes(&rest[..start], registry));
      result.push_str(&rest[start..=end]);
      rest = &rest[end + 1..];
    } else {
      result.push_str(&replace_shortcodes(rest, registry));
      return result;
    }
  }

  result.push_str(&replace_shortcodes(rest, registry));
  result
}

/// Replace `:name:` tokens in a non-code-span string.
fn replace_shortcodes(text: &str, registry: &[(String, String)]) -> String {
  let mut result = String::with_capacity(text.len());
  let mut rest = text;

  while let Some(start) = rest.find(':') {
    if let Some(end) = rest[start + 1..].find(':') {
      let end = start + 1 + end;
      let name = &rest[start + 1..end];
      if !name.is_empty() && name.bytes().all(is_shortcode_char) {
        result.push_str(&rest[..start]);
        if let Some((_, emoji)) = registry.iter().find(|(n, _)| n == name) {
          result.push_str(emoji);
        } else {
          result.push_str(&rest[start..=end]);
        }
        rest = &rest[end + 1..];
      } else {
        result.push_str(&rest[..=start]);
        rest = &rest[start + 1..];
      }
    } else {
      result.push_str(rest);
      return result;
    }
  }

  result.push_str(rest);
  result
}

/// Find the `:` emoji token ending at the caret (end of `text`).
///
/// Mirrors `findEmojiCaretToken`: scans for `:`-prefixed tokens that are
/// start/whitespace-anchored, case-insensitive, and end at `text.len()`.
/// Returns the last such token (the one closest to the caret).
pub fn find_caret_token(text: &str) -> Option<CaretToken> {
  let bytes = text.as_bytes();
  let mut result = None;

  for (i, &b) in bytes.iter().enumerate() {
    if b != b':' {
      continue;
    }
    if i > 0 && !bytes[i - 1].is_ascii_whitespace() {
      continue;
    }

    let mut j = i + 1;
    while j < bytes.len() && is_query_char(bytes[j]) {
      j += 1;
    }
    if j < bytes.len() && !bytes[j].is_ascii_whitespace() {
      continue;
    }
    if j != text.len() {
      continue;
    }

    let match_start = if i > 0 && bytes[i - 1].is_ascii_whitespace() {
      i - 1
    } else {
      i
    };
    result = Some(CaretToken {
      match_start,
      query_start: i + 1,
      query_len: j - (i + 1),
    });
  }

  result
}

/// Check if text ends with a closed `:name:` shortcode (case-insensitive).
fn is_closed_token(text: &str) -> bool {
  let bytes = text.as_bytes();
  let mut i = bytes.len();

  while i > 0 && bytes[i - 1].is_ascii_whitespace() {
    i -= 1;
  }
  if i == 0 || bytes[i - 1] != b':' {
    return false;
  }
  i -= 1;

  let mut j = i;
  while j > 0 && is_query_char(bytes[j - 1]) {
    j -= 1;
  }
  if j == i {
    return false;
  }
  j > 0 && bytes[j - 1] == b':'
}

/// Extract the emoji query from text-up-to-caret.
///
/// Mirrors `extractEmojiQuery`: returns the lowercase query without the
/// leading `:`, or `None` when no token is at the caret or the token is a
/// closed `:name:` shortcode.
pub fn extract_query(text: &str) -> Option<String> {
  let token = find_caret_token(text)?;
  if is_closed_token(text) {
    return None;
  }
  Some(text[token.query_start..token.query_start + token.query_len].to_lowercase())
}

/// Filter registry names by case-insensitive substring (registry order).
///
/// Mirrors `filterEmojiCandidates`: empty query returns all names.
pub fn filter_candidates(query: &str, registry: &[(String, String)]) -> Vec<String> {
  if query.is_empty() {
    return registry.iter().map(|(n, _)| n.clone()).collect();
  }
  let needle = query.to_lowercase();
  registry
    .iter()
    .filter(|(n, _)| n.to_lowercase().contains(&needle))
    .map(|(n, _)| n.clone())
    .collect()
}

/// Insert a candidate name at the caret token, replacing the query.
///
/// Mirrors `selectEmojiCandidate`: replaces the matched token (including
/// leading whitespace) with `sep + ":name: "` and places the caret after.
/// Returns the new text and caret position.
pub fn insert_candidate(text: &str, cursor: usize, candidate_name: &str) -> Option<(String, usize)> {
  let before = &text[..cursor];
  let after = &text[cursor..];
  let token = find_caret_token(before)?;

  let sep = &before[token.match_start..token.query_start - 1];
  let new_before = format!("{}{}:{}: ", &before[..token.match_start], sep, candidate_name);
  let new_caret = new_before.len();
  Some((format!("{new_before}{after}"), new_caret))
}

// ---------------------------------------------------------------------------
// Conformance vectors (shared with the TS client)
// ---------------------------------------------------------------------------
// Test-only: the wasm build carries no vector data.

#[cfg(test)]
#[derive(Debug, Deserialize)]
struct Vectors {
  registry: Vec<RegistryEntry>,
  render: Vec<RenderCase>,
  autocomplete: Vec<AutocompleteCase>,
  insert: Vec<InsertCase>,
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
struct RegistryEntry {
  name: String,
  emoji: String,
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
struct RenderCase {
  input: String,
  expected: String,
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutocompleteCase {
  text: String,
  cursor: usize,
  expected_query: Option<String>,
  expected_candidates: Vec<String>,
}

#[cfg(test)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InsertCase {
  text: String,
  cursor: usize,
  candidate: String,
  expected_text: String,
  expected_caret: usize,
}

#[cfg(test)]
static VECTORS: LazyLock<Vectors> =
  LazyLock::new(|| serde_json::from_str(include_str!("../emoji-vectors.json")).expect("emoji-vectors.json is valid"));

#[cfg(test)]
mod tests {
  use super::*;

  static REGISTRY: LazyLock<Vec<(String, String)>> = LazyLock::new(|| {
    VECTORS
      .registry
      .iter()
      .map(|e| (e.name.clone(), e.emoji.clone()))
      .collect()
  });

  fn registry() -> &'static [(String, String)] {
    &REGISTRY
  }

  #[test]
  fn render_shortcodes_matches_htmx() {
    for case in &VECTORS.render {
      assert_eq!(
        render_shortcodes(&case.input, registry()),
        case.expected,
        "render mismatch for {:?}",
        case.input
      );
    }
  }

  #[test]
  fn autocomplete_matches_htmx() {
    for case in &VECTORS.autocomplete {
      let before = &case.text[..case.cursor];
      let query = extract_query(before);
      assert_eq!(
        query, case.expected_query,
        "query mismatch for {:?} at cursor {}",
        case.text, case.cursor
      );
      let candidates = query
        .as_deref()
        .map(|q| filter_candidates(q, registry()))
        .unwrap_or_default();
      assert_eq!(
        candidates, case.expected_candidates,
        "candidates mismatch for {:?} at cursor {}",
        case.text, case.cursor
      );
    }
  }

  #[test]
  fn insert_matches_htmx() {
    for case in &VECTORS.insert {
      let (new_text, new_caret) = insert_candidate(&case.text, case.cursor, &case.candidate)
        .unwrap_or_else(|| panic!("insert failed for {:?}", case.text));
      assert_eq!(new_text, case.expected_text, "text mismatch for {:?}", case.text);
      assert_eq!(new_caret, case.expected_caret, "caret mismatch for {:?}", case.text);
    }
  }
}
