// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/assistant.ts — assistant section defaults
import type { AssistantConfig, } from "../schema";

export const ASSISTANT_DEFAULTS = {
  enabled: true,
  travelPrompts: false,
} satisfies AssistantConfig;
