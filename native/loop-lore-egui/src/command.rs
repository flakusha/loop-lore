// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

//! Assistant command palette — mirrors the htmx/Alpine palette
//! (`src/frontend/alpine/chat-actions/command-palette.ts`) so both clients
//! offer the same command set, role gating, and filter.
//!
//! The command list arrives as JSON (`GET /api/v1/commands`); the role gate
//! is display-only — the server's slash dispatch remains the authority.

/// Role privilege ordering, matching the htmx palette's `PALETTE_ROLE_PRIORITY`.
fn role_priority(role: &str) -> Option<i32> {
  match role {
    "guest" => Some(-1),
    "observer" => Some(0),
    "member" => Some(1),
    "owner" => Some(2),
    _ => None,
  }
}

/// Whether the viewer's role satisfies a command's minimum required role.
///
/// Mirrors `satisfiesPaletteRole` exactly: unrestricted commands (no
/// requiredRole) are always visible; the viewer's priority must meet the
/// minimum. An unknown viewer role defaults to `member` (1), an unknown
/// required role defaults to `observer` (0) — the htmx `?? 1` / `?? 0`
/// fallbacks, so the two clients agree on every input.
pub fn satisfies_role(actual: Option<&str>, required: Option<&str>) -> bool {
  let Some(req) = required else {
    return true;
  };
  let viewer = role_priority(actual.unwrap_or("member")).unwrap_or(1);
  let minimum = role_priority(req).unwrap_or(0);
  viewer >= minimum
}

/// Bounded Levenshtein distance (iterative, single row), lowercased inputs.
///
/// Port of `editDistance` in the htmx `slash-query.ts`.
fn edit_distance(a: &str, b: &str) -> usize {
  let x: Vec<char> = a.to_lowercase().chars().collect();
  let y: Vec<char> = b.to_lowercase().chars().collect();
  let mut prev: Vec<usize> = (0..=y.len()).collect();
  for i in 1..=x.len() {
    let mut curr = vec![i];
    for j in 1..=y.len() {
      let cost = usize::from(x[i - 1] != y[j - 1]);
      curr.push((prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost));
    }
    prev = curr;
  }
  prev[y.len()]
}

/// Closest registry name to a zero-substring-match query, or `None`.
///
/// Port of `didYouMeanCandidate`: `startsWith` scores 0, otherwise the edit
/// distance; nothing is suggested past `max(1, floor(len/2))`.
fn did_you_mean<'a>(names: &[&'a str], needle: &str) -> Option<&'a str> {
  let query = needle.to_lowercase();
  if query.is_empty() {
    return None;
  }
  let mut best: Option<&str> = None;
  let mut best_score = usize::MAX;
  for name in names {
    let lower = name.to_lowercase();
    let score = if lower.starts_with(&query) {
      0
    } else {
      edit_distance(&query, &lower)
    };
    if score < best_score {
      best_score = score;
      best = Some(name);
    }
  }
  let threshold = 1usize.max(query.chars().count() / 2);
  best.filter(|_| best_score <= threshold)
}

/// Filter command names by substring (case-insensitive, registry order),
/// falling back to a single did-you-mean suggestion when nothing matches.
///
/// Mirrors `filterPaletteEntries`: names containing the query, in registry
/// order; empty query returns all; zero matches falls back to the closest
/// name within the edit-distance threshold, else an empty list.
pub fn filter_commands<'a>(commands: &[&'a str], query: &str) -> Vec<&'a str> {
  let needle = query.to_lowercase();
  let filtered: Vec<&str> = commands
    .iter()
    .filter(|name| name.to_lowercase().contains(&needle))
    .copied()
    .collect();
  if !filtered.is_empty() {
    return filtered;
  }
  match did_you_mean(commands, &needle) {
    Some(name) => vec![name],
    None => Vec::new(),
  }
}

/// The composer text after accepting a palette command.
///
/// Mirrors `selectCommand`: inserts `/${name} ` into the composer.
pub fn insert_command(composer: &str, name: &str) -> String {
  format!("{composer}/{name} ")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn unrestricted_commands_are_always_visible() {
    assert!(satisfies_role(Some("member"), None),);
    assert!(satisfies_role(None, None),);
  }

  #[test]
  fn owner_sees_everything() {
    assert!(satisfies_role(Some("owner"), Some("owner")),);
    assert!(satisfies_role(Some("owner"), Some("member")),);
  }

  #[test]
  fn member_does_not_see_owner_commands() {
    assert!(!satisfies_role(Some("member"), Some("owner")),);
  }

  #[test]
  fn unknown_role_defaults_to_member() {
    assert!(satisfies_role(None, Some("member")),);
    assert!(!satisfies_role(None, Some("owner")),);
  }

  #[test]
  fn filter_is_case_insensitive_and_preserves_order() {
    let commands = ["roll", "guide", "stats"];
    assert_eq!(filter_commands(&commands, "st"), vec!["stats"]);
    assert_eq!(filter_commands(&commands, "ST"), vec!["stats"]);
    assert_eq!(filter_commands(&commands, ""), vec!["roll", "guide", "stats"]);
    assert_eq!(filter_commands(&commands, "zzz"), Vec::<&str>::new());
  }

  #[test]
  fn filter_falls_back_to_did_you_mean() {
    let commands = ["roll", "help"];
    // `/rol` has no substring hit but is one edit from `roll`.
    assert_eq!(filter_commands(&commands, "rol"), vec!["roll"]);
    // Prefix hit scores 0 and wins over edit distance.
    assert_eq!(filter_commands(&commands, "he"), vec!["help"]);
    // Unrelated input yields nothing.
    assert_eq!(filter_commands(&commands, "zzz"), Vec::<&str>::new());
  }

  #[test]
  fn edit_distance_matches_known_pairs() {
    assert_eq!(edit_distance("roll", "roll"), 0);
    assert_eq!(edit_distance("rol", "roll"), 1);
    assert_eq!(edit_distance("kitten", "sitting"), 3);
  }

  #[test]
  fn insert_command_appends_slash_prefix() {
    assert_eq!(insert_command("", "roll"), "/roll ",);
    assert_eq!(insert_command("hello ", "guide"), "hello /guide ",);
  }

  /// Shared fixture: the live command registry frozen for both clients.
  ///
  /// `command-vectors.json` is generated from `GET /api/v1/commands`
  /// (scripts/native + the TS contract test); a server-side rename or role
  /// change makes this test and the TS half disagree with the file.
  #[derive(serde::Deserialize)]
  struct Vectors {
    commands: Vec<CommandVector>,
    #[serde(rename = "roleGate")]
    role_gate: Vec<RoleGateCase>,
    filter: Vec<FilterCase>,
  }

  #[derive(serde::Deserialize)]
  struct FilterCase {
    query: String,
    expected: Vec<String>,
  }

  #[derive(serde::Deserialize)]
  struct CommandVector {
    name: String,
    #[serde(rename = "requiredRole")]
    required_role: Option<String>,
  }

  #[derive(serde::Deserialize)]
  struct RoleGateCase {
    viewer: Option<String>,
    required: Option<String>,
    visible: bool,
  }

  fn vectors() -> Vectors {
    serde_json::from_str(include_str!("../command-vectors.json")).expect("command-vectors.json is valid")
  }

  #[test]
  fn conformance_parse_matches_the_frozen_registry() {
    let v = vectors();
    // Rebuild the server payload the parser consumes, then compare entries.
    let data: Vec<serde_json::Value> = v
      .commands
      .iter()
      .map(|c| {
        let mut row = serde_json::json!({ "name": c.name });
        if let Some(role) = &c.required_role {
          row["requiredRole"] = serde_json::Value::String(role.clone());
        }
        row
      })
      .collect();
    let payload = serde_json::json!({ "data": data, "roleInChat": "member" }).to_string();
    let (entries, role) = crate::api::parse_command_list(&payload).unwrap();
    assert_eq!(entries.len(), v.commands.len());
    assert_eq!(role.as_deref(), Some("member"));
    for (entry, expected) in entries.iter().zip(v.commands.iter()) {
      assert_eq!(entry.name, expected.name);
      assert_eq!(entry.required_role, expected.required_role);
    }
  }

  #[test]
  fn conformance_role_gate_matches_the_frozen_truth_table() {
    let v = vectors();
    for case in &v.role_gate {
      assert_eq!(
        satisfies_role(case.viewer.as_deref(), case.required.as_deref()),
        case.visible,
        "viewer={:?} required={:?}",
        case.viewer,
        case.required,
      );
    }
  }

  #[test]
  fn conformance_filter_matches_the_frozen_htmx_output() {
    let v = vectors();
    let names: Vec<&str> = v.commands.iter().map(|c| c.name.as_str()).collect();
    for case in &v.filter {
      assert_eq!(
        filter_commands(&names, &case.query),
        case.expected.iter().map(String::as_str).collect::<Vec<_>>(),
        "query={:?}",
        case.query,
      );
    }
  }
}
