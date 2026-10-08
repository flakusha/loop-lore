// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assistant personality contracts (epic-character-multi-personality).
 *
 * The assistant/GM wears one of three voices per chat: the server default (no
 * extra prompt block), a canonical preset, or an existing character card
 * reused as the GM voice. See ./presets for the canonical catalog and
 * ./composer for the prompt-emission path.
 */

/** Canonical preset keys (owned here; ./presets supplies the catalog). */
export type PersonalityPresetKey =
  | "serious"
  | "helpful"
  | "quirky"
  | "fun"
  | "melancholic"
  | "snarky"
  | "nurturing"
  | "horror"
  | "stoic"
  | "ecstatic";

/** Voice dials for a preset: tone cues, register and expressiveness ranges. */
export interface PersonalityPresetVoice {
  /** Vocabulary cues: "measured", "clinical", "warm", … */
  tone: string[];
  /** 0 = clipped, 4 = ceremonial. */
  formalityLevel: 0 | 1 | 2 | 3 | 4;
  /** 0 = humorless, 4 = comic. */
  humorLevel: 0 | 1 | 2 | 3 | 4;
  /** 0..100 expressive range. */
  emotionBandwidth: number;
  /** Bias tokens for the voice (no hardcoded slurs). */
  vocabularyHints: string[];
}

/** One canonical assistant personality preset. */
export interface PersonalityPreset {
  id: string;
  key: PersonalityPresetKey;
  displayName: string;
  voice: PersonalityPresetVoice;
  /** Welcome-message templates and scenario presets. */
  scenarioSeeds: string[];
  /** System-prompt fragments appended to the base prompt. */
  promptBlocks: string[];
  /** Preset default mood palette seed. */
  defaultMood: string;
}

/** Where the assistant's voice comes from. */
export type AssistantPersonalitySource =
  | { kind: "preset"; presetKey: PersonalityPresetKey }
  | { kind: "character"; actorId: string }
  | { kind: "server-default" };

/** Active assistant personality for one chat. */
export interface AssistantPersonalityState {
  chatId: string;
  source: AssistantPersonalitySource;
  /** Epoch ms when the voice was locked, or null while still adjustable. */
  lockedAt: number | null;
  /** 0..1 aux drift score; above 0.5 emits an advisory. */
  driftScore: number;
  advisoryEnabled: boolean;
}

/**
 * Persisted binding shape (`gm_config.assistantPersonality`). Mirrors
 * {@link AssistantPersonalityState} minus the chat id (the chat row owns it)
 * and the drift score (aux-owned, never persisted with the binding).
 */
export interface AssistantPersonalityBinding {
  source: AssistantPersonalitySource;
  lockedAt: number | null;
  advisoryEnabled: boolean;
}
