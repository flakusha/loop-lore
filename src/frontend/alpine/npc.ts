// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Management UI — Alpine.js Component
 *
 * Provides NPC viewer, relationship map, faction relations, and karma display.
 * Uses mock data for UI development — no backend dependency.
 * Follows rpg-stats.ts pattern: extends ChatState via (globalThis as any).
 */
import type {
  NpcData,
  NpcFaction,
  NpcKarma,
  NpcRelationship,
} from "./chat-types/npc";

import { npcDisplay, } from "./npc-display";
import { MOCK_FACTIONS, MOCK_KARMA, } from "./npc-faction-mock.js";
import { MOCK_NPCS, MOCK_RELATIONSHIPS, STANDING_TIERS, } from "./npc-mock.js";

// ── Component Registration ──────────────────────────────────
(globalThis as any).npcManagementState = function() {
  return {
    ...npcDisplay,

    // NPC Viewer
    npcs: [] as NpcData[],
    selectedNpcId: null as string | null,
    npcSearch: "",
    npcFilter: "all",
    loadingNpcs: false,

    // Relationships
    relationships: [] as NpcRelationship[],
    loadingRelationships: false,

    // Factions
    factions: [] as NpcFaction[],
    selectedFactionId: null as string | null,
    loadingFactions: false,

    // Karma
    karma: null as NpcKarma | null,
    loadingKarma: false,

    // Active panel
    npcActivePanel: "viewer" as "viewer" | "relationships" | "factions" | "karma",

    // Standing tiers
    standingTiers: STANDING_TIERS,

    init() {
      this.loadNpcs();
      this.loadRelationships();
      this.loadFactions();
      this.loadKarma();
    },

    // ── NPC Viewer ──────────────────────────────────────────
    async loadNpcs() {
      this.loadingNpcs = true;
      // Mock data — replace with API call when backend is ready
      await new Promise((r,) => setTimeout(r, 300,));
      this.npcs = MOCK_NPCS;
      if (this.npcs.length > 0 && !this.selectedNpcId) {
        this.selectedNpcId = this.npcs[0]!.id;
      }
      this.loadingNpcs = false;
    },

    selectNpc(id: string,) {
      this.selectedNpcId = id;
    },

    get selectedNpc(): NpcData | null {
      return this.npcs.find((n,) => n.id === this.selectedNpcId) ?? null;
    },

    get filteredNpcs(): NpcData[] {
      const result: NpcData[] = [];
      const q = this.npcSearch.trim().toLowerCase();
      for (const n of this.npcs) {
        if (
          q && !n.name.toLowerCase().includes(q,) && !n.role.toLowerCase().includes(q,) &&
          !n.location.toLowerCase().includes(q,)
        ) {
          continue;
        }
        if (this.npcFilter !== "all" && n.disposition !== this.npcFilter) {
          continue;
        }
        result.push(n,);
      }
      return result;
    },

    // ── Relationships ───────────────────────────────────────
    async loadRelationships() {
      this.loadingRelationships = true;
      await new Promise((r,) => setTimeout(r, 200,));
      this.relationships = MOCK_RELATIONSHIPS;
      this.loadingRelationships = false;
    },

    playerRelationships(): NpcRelationship[] {
      return npcDisplay.playerRelationships(this.relationships,);
    },

    npcRelationships(): NpcRelationship[] {
      return npcDisplay.npcRelationships(this.relationships,);
    },

    // ── Factions ────────────────────────────────────────────
    async loadFactions() {
      this.loadingFactions = true;
      await new Promise((r,) => setTimeout(r, 200,));
      this.factions = MOCK_FACTIONS;
      if (this.factions.length > 0 && !this.selectedFactionId) {
        this.selectedFactionId = this.factions[0]!.id;
      }
      this.loadingFactions = false;
    },

    selectFaction(id: string,) {
      this.selectedFactionId = id;
    },

    get selectedFaction(): NpcFaction | null {
      return this.factions.find((f,) => f.id === this.selectedFactionId) ?? null;
    },

    // ── Karma ───────────────────────────────────────────────
    async loadKarma() {
      this.loadingKarma = true;
      await new Promise((r,) => setTimeout(r, 200,));
      this.karma = MOCK_KARMA;
      this.loadingKarma = false;
    },
  };
};
