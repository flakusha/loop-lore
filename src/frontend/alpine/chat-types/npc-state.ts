// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  NpcData,
  NpcFaction,
  NpcKarma,
  NpcRelationship,
} from "./npc";

// ── NPC Management UI State ─────────────────────────────────
export interface ChatNpcState {
  // NPC Viewer
  npcs: NpcData[];
  selectedNpcId: string | null;
  npcSearch: string;
  npcFilter: string;
  loadingNpcs: boolean;

  // Relationships
  relationships: NpcRelationship[];
  loadingRelationships: boolean;

  // Factions
  factions: NpcFaction[];
  selectedFactionId: string | null;
  loadingFactions: boolean;

  // Karma
  karma: NpcKarma | null;
  loadingKarma: boolean;

  // Active panel
  npcActivePanel: "viewer" | "relationships" | "factions" | "karma";

  // Methods
  loadNpcs(): Promise<void>;
  selectNpc(id: string,): void;
  filteredNpcs(): NpcData[];
  loadRelationships(): Promise<void>;
  loadFactions(): Promise<void>;
  selectFaction(id: string,): void;
  loadKarma(): Promise<void>;
  getDispositionColor(disposition: string,): string;
  getRelationshipColor(type: string,): string;
}
