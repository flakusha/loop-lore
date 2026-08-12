import { createMachine, type StateDef, } from "../state";

// ── Items ─────────────────────────────────────────────────
export const ItemCategory = {
  Weapon: "weapon",
  Armor: "armor",
  Consumable: "consumable",
  KeyItem: "key_item",
  QuestItem: "quest_item",
  Material: "material",
  Tool: "tool",
  Container: "container",
  Treasure: "treasure",
  Book: "book",
  Artifact: "artifact",
  Misc: "misc",
  Other: "other",
} as const;
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const ItemRarity = {
  Common: "common",
  Uncommon: "uncommon",
  Rare: "rare",
  Epic: "epic",
  Legendary: "legendary",
  Unique: "unique",
  Artifact: "artifact",
} as const;
export type ItemRarity = (typeof ItemRarity)[keyof typeof ItemRarity];

export const ItemVisibility = {
  Visible: "visible",
  Hidden: "hidden",
} as const;
export type ItemVisibility = (typeof ItemVisibility)[keyof typeof ItemVisibility];

/** Publication lifecycle for generated/created entities (worlds, locations, items). */
export const PublicationStatus = {
  Draft: "draft",
  Review: "review",
  Published: "published",
  Rejected: "rejected",
  Archived: "archived",
} as const;
export type PublicationStatus = (typeof PublicationStatus)[keyof typeof PublicationStatus];

const publicationStatusDef: StateDef<PublicationStatus> = {
  values: ["draft", "review", "published", "rejected", "archived",] as const,
  initial: "draft",
  transitions: {
    draft: ["review", "published", "rejected",],
    review: ["published", "rejected",],
    published: ["archived", "rejected",],
    rejected: ["draft",],
    archived: [],
  },
  terminal: ["archived",],
};

export const publicationStatusMachine = createMachine(publicationStatusDef,);
