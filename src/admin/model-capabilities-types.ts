// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model capabilities registry types — the persisted row shape and the
 * resolved (auto-detected + user-override merged) capability result.
 *
 * Kept separate from the service so routes, provider health, and the
 * frontend bindings can import the types without pulling in DB logic.
 */

/** Persisted model capability row. */
export interface ModelCapabilityRow {
  id: string;
  provider_id: string;
  model_id: string;
  context_window: number | null;
  max_output: number | null;
  supports_tools: number; // 0/1 boolean
  supports_vision: number;
  supports_thinking: number;
  modalities: string | null; // JSON array
  param_size: string | null;
  owned_by: string | null;
  user_override: number; // 0/1 boolean
  notes: string | null;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

/** Merged capability result (auto-detected + user overrides). */
export interface ResolvedModelCapabilities {
  providerId: string;
  modelId: string;
  contextWindow: number | null;
  maxOutput: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  modalities: string[];
  paramSize: string | null;
  ownedBy: string | null;
  isStale: boolean;
  lastSeen: string;
  userOverride: boolean;
  notes: string | null;
}
