// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/assistant.ts — Assistant config type

export interface AssistantConfig {
  enabled: boolean;
  /**
   * Bound/linked travel mode: when on, the assistant prompt instructs the LLM
   * it may narrate travel and suggest moving the chat to another location/chat
   * when the narrative leaves the current one. Suggestions reference only
   * known world locations. Default off.
   */
  travelPrompts: boolean;
}
