// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Quest row / world option types for the Quests page (quests.ts).

export interface QuestRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  category: string;
  status: string;
  priority: number;
  progress: number;
  target: number;
  world_id: string;
  created_at: string;
}

export interface WorldOption {
  id: string;
  name: string;
}
