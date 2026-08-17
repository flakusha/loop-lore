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
  StandingTier,
} from "./chat-types/npc";

// ── Standing Tiers ──────────────────────────────────────────
const STANDING_TIERS: StandingTier[] = [
  { name: "Hated", min: -100, max: -76, color: "var(--accent-red)", },
  { name: "Hostile", min: -75, max: -60, color: "var(--accent-red)", },
  { name: "Unfriendly", min: -59, max: -40, color: "var(--accent-orange)", },
  { name: "Neutral", min: -39, max: 39, color: "var(--text-muted)", },
  { name: "Friendly", min: 40, max: 59, color: "var(--accent-green)", },
  { name: "Honored", min: 60, max: 74, color: "var(--accent-blue)", },
  { name: "Revered", min: 75, max: 89, color: "var(--accent-purple)", },
  { name: "Exalted", min: 90, max: 100, color: "var(--accent-gold)", },
];

// ── Mock Data ───────────────────────────────────────────────
const MOCK_NPCS: NpcData[] = [
  {
    id: "npc-merchant",
    name: "Merchant",
    role: "Merchant",
    location: "Village Market",
    disposition: "friendly",
    dispositionScore: 75,
    description: "A shrewd trader with a warm smile and sharp eyes for profit.",
    stats: [
      { name: "Persuasion", value: 15, },
      { name: "Intimidation", value: 5, },
      { name: "Commerce", value: 20, },
    ],
    inventory: [
      { id: "iron-sword", name: "Iron Sword", category: "weapon", quantity: 3, },
      { id: "health-potion", name: "Health Potion", category: "consumable", quantity: 12, },
      { id: "mana-potion", name: "Mana Potion", category: "consumable", quantity: 8, },
      { id: "shield", name: "Shield", category: "armor", quantity: 2, },
    ],
    schedule: [
      { startTime: "06:00", endTime: "18:00", activity: "Trading", location: "Market", },
      { startTime: "18:00", endTime: "22:00", activity: "Resting", location: "Inn", },
      { startTime: "22:00", endTime: "06:00", activity: "Sleeping", location: "Home", },
    ],
    factionId: "faction-merchants",
    portrait: null,
  },
  {
    id: "npc-guard",
    name: "Guard",
    role: "City Guard",
    location: "Town Gate",
    disposition: "neutral",
    dispositionScore: 10,
    description: "A vigilant protector of the town, stern but fair.",
    stats: [
      { name: "Strength", value: 14, },
      { name: "Perception", value: 12, },
      { name: "Intimidation", value: 10, },
    ],
    inventory: [
      { id: "guard-spear", name: "Guard Spear", category: "weapon", quantity: 1, },
      { id: "chainmail", name: "Chainmail", category: "armor", quantity: 1, },
    ],
    schedule: [
      { startTime: "06:00", endTime: "18:00", activity: "Patrolling", location: "Town Gate", },
      { startTime: "18:00", endTime: "22:00", activity: "Off Duty", location: "Barracks", },
      { startTime: "22:00", endTime: "06:00", activity: "Sleeping", location: "Barracks", },
    ],
    factionId: "faction-guard",
    portrait: null,
  },
  {
    id: "npc-blacksmith",
    name: "Blacksmith",
    role: "Blacksmith",
    location: "Forge",
    disposition: "friendly",
    dispositionScore: 60,
    description: "A master craftsman who shapes metal into marvels.",
    stats: [
      { name: "Crafting", value: 18, },
      { name: "Strength", value: 16, },
      { name: "Commerce", value: 10, },
    ],
    inventory: [
      { id: "steel-ingot", name: "Steel Ingot", category: "material", quantity: 20, },
      { id: "iron-ingot", name: "Iron Ingot", category: "material", quantity: 30, },
      { id: "hammer", name: "Smithing Hammer", category: "tool", quantity: 2, },
    ],
    schedule: [
      { startTime: "05:00", endTime: "19:00", activity: "Smithing", location: "Forge", },
      { startTime: "19:00", endTime: "22:00", activity: "Resting", location: "Inn", },
      { startTime: "22:00", endTime: "05:00", activity: "Sleeping", location: "Home", },
    ],
    factionId: "faction-merchants",
    portrait: null,
  },
  {
    id: "npc-healer",
    name: "Healer",
    role: "Healer",
    location: "Temple",
    disposition: "honored",
    dispositionScore: 80,
    description: "A devoted priest who tends to the sick and wounded.",
    stats: [
      { name: "Healing", value: 20, },
      { name: "Wisdom", value: 16, },
      { name: "Persuasion", value: 12, },
    ],
    inventory: [
      { id: "holy-symbol", name: "Holy Symbol", category: "key_item", quantity: 1, },
      { id: "healing-herbs", name: "Healing Herbs", category: "material", quantity: 15, },
    ],
    schedule: [
      { startTime: "04:00", endTime: "12:00", activity: "Prayer", location: "Temple", },
      { startTime: "12:00", endTime: "20:00", activity: "Healing", location: "Temple", },
      { startTime: "20:00", endTime: "04:00", activity: "Meditation", location: "Temple Quarters", },
    ],
    factionId: "faction-temple",
    portrait: null,
  },
  {
    id: "npc-stranger",
    name: "Mysterious Stranger",
    role: "Unknown",
    location: "Tavern",
    disposition: "neutral",
    dispositionScore: 0,
    description: "A cloaked figure who speaks in riddles and watches from the shadows.",
    stats: [
      { name: "Stealth", value: 18, },
      { name: "Deception", value: 16, },
      { name: "Perception", value: 14, },
    ],
    inventory: [],
    schedule: [
      { startTime: "20:00", endTime: "02:00", activity: "Lurking", location: "Tavern", },
      { startTime: "02:00", endTime: "20:00", activity: "Gone", location: "Unknown", },
    ],
    factionId: null,
    portrait: null,
  },
];

const MOCK_RELATIONSHIPS: NpcRelationship[] = [
  {
    id: "rel-1",
    fromId: "player",
    fromName: "Player",
    toId: "npc-merchant",
    toName: "Merchant",
    type: "friend",
    strength: 75,
    history: ["Traded多次", "Helped with delivery",],
  },
  {
    id: "rel-2",
    fromId: "player",
    fromName: "Player",
    toId: "npc-guard",
    toName: "Guard",
    type: "neutral",
    strength: 10,
    history: ["Brief encounter",],
  },
  {
    id: "rel-3",
    fromId: "player",
    fromName: "Player",
    toId: "npc-healer",
    toName: "Healer",
    type: "ally",
    strength: 80,
    history: ["Healed wounds", "Shared knowledge",],
  },
  {
    id: "rel-4",
    fromId: "npc-merchant",
    fromName: "Merchant",
    toId: "npc-blacksmith",
    toName: "Blacksmith",
    type: "friend",
    strength: 60,
    history: ["Business partners",],
  },
  {
    id: "rel-5",
    fromId: "npc-guard",
    fromName: "Guard",
    toId: "npc-stranger",
    toName: "Mysterious Stranger",
    type: "rival",
    strength: -30,
    history: ["Suspicious of stranger",],
  },
  {
    id: "rel-6",
    fromId: "npc-healer",
    fromName: "Healer",
    toId: "npc-merchant",
    toName: "Merchant",
    type: "friend",
    strength: 40,
    history: ["Heals merchant's ailments",],
  },
];

const MOCK_FACTIONS: NpcFaction[] = [
  {
    id: "faction-merchants",
    name: "Merchants Guild",
    icon: "🏰",
    description: "A powerful guild of traders and merchants.",
    standing: 75,
    disposition: "honored",
    tier: "Honored",
    benefits: ["10% discount at all merchants", "Access to rare items", "Priority trading",],
    quests: [
      { id: "quest-1", name: "Deliver supplies to remote village", completed: false, },
      { id: "quest-2", name: "Investigate competitor", completed: true, },
    ],
    members: [
      { id: "npc-merchant", name: "Merchant", role: "Leader", },
      { id: "npc-blacksmith", name: "Blacksmith", role: "Member", },
    ],
  },
  {
    id: "faction-guard",
    name: "City Guard",
    icon: "⚔️",
    description: "The sworn protectors of the town and its people.",
    standing: 50,
    disposition: "friendly",
    tier: "Friendly",
    benefits: ["Access to guard equipment", "Bounty board access",],
    quests: [
      { id: "quest-3", name: "Patrol the outer walls", completed: false, },
    ],
    members: [
      { id: "npc-guard", name: "Guard", role: "Member", },
    ],
  },
  {
    id: "faction-temple",
    name: "Temple of Light",
    icon: "🏛️",
    description: "A holy order devoted to healing and protection.",
    standing: 90,
    disposition: "revered",
    tier: "Revered",
    benefits: ["Free healing", "Blessing buffs", "Holy items access",],
    quests: [
      { id: "quest-4", name: "Cleanse the cursed ruins", completed: false, },
      { id: "quest-5", name: "Gather sacred herbs", completed: true, },
    ],
    members: [
      { id: "npc-healer", name: "Healer", role: "Priest", },
    ],
  },
  {
    id: "faction-thieves",
    name: "Thieves Guild",
    icon: "💀",
    description: "A shadowy organization operating in the underground.",
    standing: -50,
    disposition: "hostile",
    tier: "Hostile",
    benefits: [],
    quests: [],
    members: [],
  },
];

const MOCK_KARMA: NpcKarma = {
  overall: 45,
  categories: [
    { name: "compassion", value: 60, label: "Heroic", },
    { name: "justice", value: 30, label: "Fair", },
    { name: "honor", value: 50, label: "Noble", },
    { name: "courage", value: 40, label: "Brave", },
  ],
  titles: ["Hero of the Village", "Friend of the Forest",],
};

// ── Component Registration ──────────────────────────────────
(globalThis as any).npcManagementState = function() {
  return {
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

    getDispositionColor(disposition: string,): string {
      switch (disposition) {
        case "hostile": {
          return "var(--accent-red)";
        }
        case "unfriendly": {
          return "var(--accent-orange)";
        }
        case "neutral": {
          return "var(--text-muted)";
        }
        case "friendly": {
          return "var(--accent-green)";
        }
        case "honored": {
          return "var(--accent-blue)";
        }
        case "revered": {
          return "var(--accent-purple)";
        }
        case "exalted": {
          return "var(--accent-gold)";
        }
        default: {
          return "var(--text-muted)";
        }
      }
    },

    getDispositionLabel(disposition: string,): string {
      return disposition.charAt(0,).toUpperCase() + disposition.slice(1,);
    },

    // ── Relationships ───────────────────────────────────────
    async loadRelationships() {
      this.loadingRelationships = true;
      await new Promise((r,) => setTimeout(r, 200,));
      this.relationships = MOCK_RELATIONSHIPS;
      this.loadingRelationships = false;
    },

    getRelationshipColor(type: string,): string {
      switch (type) {
        case "friend": {
          return "var(--accent-green)";
        }
        case "ally": {
          return "var(--accent-blue)";
        }
        case "rival": {
          return "var(--accent-orange)";
        }
        case "enemy": {
          return "var(--accent-red)";
        }
        case "mentor": {
          return "var(--accent-purple)";
        }
        default: {
          return "var(--text-muted)";
        }
      }
    },

    getStrengthLabel(strength: number,): string {
      const abs = Math.abs(strength,);
      if (abs >= 75) { return "Strong"; }
      if (abs >= 50) { return "Moderate"; }
      if (abs >= 25) { return "Weak"; }
      return "Minimal";
    },

    playerRelationships(): NpcRelationship[] {
      const result: NpcRelationship[] = [];
      for (const r of this.relationships) {
        if (r.fromId === "player" || r.toId === "player") { result.push(r,); }
      }
      return result;
    },

    npcRelationships(): NpcRelationship[] {
      const result: NpcRelationship[] = [];
      for (const r of this.relationships) {
        if (r.fromId !== "player" && r.toId !== "player") { result.push(r,); }
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

    getFactionStandingColor(standing: number,): string {
      for (const tier of STANDING_TIERS) {
        if (standing >= tier.min && standing <= tier.max) { return tier.color; }
      }
      return "var(--text-muted)";
    },

    getFactionTier(standing: number,): string {
      for (const tier of STANDING_TIERS) {
        if (standing >= tier.min && standing <= tier.max) { return tier.name; }
      }
      return "Neutral";
    },

    // ── Karma ───────────────────────────────────────────────
    async loadKarma() {
      this.loadingKarma = true;
      await new Promise((r,) => setTimeout(r, 200,));
      this.karma = MOCK_KARMA;
      this.loadingKarma = false;
    },

    getKarmaLabel(value: number,): string {
      if (value >= 75) { return "Saintly"; }
      if (value >= 50) { return "Good"; }
      if (value >= 25) { return "Fair"; }
      if (value >= 0) { return "Neutral"; }
      if (value >= -25) { return "Dubious"; }
      if (value >= -50) { return "Wicked"; }
      return "Evil";
    },

    getKarmaColor(value: number,): string {
      if (value >= 50) { return "var(--accent-green)"; }
      if (value >= 0) { return "var(--text-muted)"; }
      return "var(--accent-red)";
    },

    karmaPercent(value: number,): number {
      return Math.round(((value + 100) / 200) * 100,);
    },
  };
};
