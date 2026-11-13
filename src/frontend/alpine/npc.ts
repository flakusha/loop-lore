// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Management UI — Alpine.js Component
 *
 * Provides NPC viewer, relationship map, faction relations, and karma display.
 * Relationships come from the shipped relationships API (npc-relationships);
 * the viewer, factions, and karma sub-panels still use mock data.
 * Follows rpg-stats.ts pattern: extends ChatState via (globalThis as any).
 */
import type {
  NpcData,
  NpcFaction,
  NpcKarma,
} from "./chat-types/npc";

import { npcDisplay, } from "./npc-display";
import { MOCK_FACTIONS, MOCK_KARMA, } from "./npc-faction-mock.js";
import { MOCK_NPCS, STANDING_TIERS, } from "./npc-mock.js";
import { npcRelationshipsPanel, } from "./npc-relationships";

// ── Component Registration ──────────────────────────────────
npcManagementState = function() {
  return {
    ...npcDisplay,
    ...npcRelationshipsPanel,

    // NPC Viewer
    npcs: [] as NpcData[],
    selectedNpcId: null as string | null,
    npcSearch: "",
    npcFilter: "all",
    loadingNpcs: false,

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
