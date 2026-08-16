// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Data Types
 *
 * Shapes for captured QA scenarios. A single SyntheticData row holds many
 * SyntheticCase entries serialized as `generated_cases`.
 */
export interface SyntheticCase {
  id: string;
  type: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

/** Snapshot of chat/world state used to derive scenarios. */
export interface SyntheticSource {
  chatId: string;
  worldId: string | null;
  messages: { actorId: string; role: string; content: string }[];
  quests: { id: string; type: string; status: string; config: unknown }[];
  questProgress: { questId: string; progress: number; status: string }[];
  worldStates: { id: string; snapshot: unknown }[];
}
