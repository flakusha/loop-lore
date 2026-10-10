// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { GmConfig, } from "../types";

/**
 * GM story-mode configuration: LLM/actor model overrides and escalation.
 * Persisted to `gm_config`, same store as the VN block in ./vn-settings.ts.
 */
export interface ChatCoreGmSettingsState {
  _assistantRole: "off" | "helper" | "gm" | "moderator";
  _gmType: "llm" | "human" | "hybrid";
  _gmHumanActorId: string;
  _gmEscalationThreshold: number;
  // GM LLM settings + per-actor overrides (multi-LLM story mode) — persisted to gm_config.
  _gmModel: string;
  _gmProvider: string;
  _gmTemperature: number;
  _gmMaxTokens: number;
  _assistantTemperature: number | null;
  _assistantMaxTokens: number | null;
  _actorModels: Record<string, { model: string; provider: string }>;
  readonly _actorModelRows: { actor_id: string; label: string; slot: { model: string; provider: string } }[];
  loadActorModels: (config: GmConfig,) => void;
}
