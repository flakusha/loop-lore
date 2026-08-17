// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Mock faction/karma data for the NPC management UI. */

import type { NpcFaction, NpcKarma, } from "./chat-types/npc.js";

export const MOCK_FACTIONS: NpcFaction[] = [
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

export const MOCK_KARMA: NpcKarma = {
  overall: 45,
  categories: [
    { name: "compassion", value: 60, label: "Heroic", },
    { name: "justice", value: 30, label: "Fair", },
    { name: "honor", value: 50, label: "Noble", },
    { name: "courage", value: 40, label: "Brave", },
  ],
  titles: ["Hero of the Village", "Friend of the Forest",],
};
