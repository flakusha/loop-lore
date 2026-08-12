// ── Boolean Flags (replacing integer 0/1) ───────────────
export const PinnedState = {
  Unpinned: "unpinned",
  Pinned: "pinned",
  Archived: "archived",
} as const;
export type PinnedState = (typeof PinnedState)[keyof typeof PinnedState];

export const DefaultState = {
  NotDefault: "not_default",
  Default: "default",
} as const;
export type DefaultState = (typeof DefaultState)[keyof typeof DefaultState];

export const EquipState = {
  Unequipped: "unequipped",
  Equipped: "equipped",
} as const;
export type EquipState = (typeof EquipState)[keyof typeof EquipState];

export const StackableState = {
  Unique: "unique",
  Stackable: "stackable",
} as const;
export type StackableState = (typeof StackableState)[keyof typeof StackableState];

// ── Actor Keys ────────────────────────────────────────────
export const KeyType = {
  Signing: "signing",
  Encryption: "encryption",
  Symmetric: "symmetric",
  Master: "master",
  Primary: "primary",
} as const;
export type KeyType = (typeof KeyType)[keyof typeof KeyType];

export const KeyStatus = {
  Active: "active",
  Expired: "expired",
  Revoked: "revoked",
} as const;
export type KeyStatus = (typeof KeyStatus)[keyof typeof KeyStatus];

// ── Notes ─────────────────────────────────────────────────
export const NoteCategory = {
  General: "general",
  World: "world",
  Character: "character",
  Story: "story",
  Combat: "combat",
  Session: "session",
} as const;
export type NoteCategory = (typeof NoteCategory)[keyof typeof NoteCategory];

// ── Model Roles ───────────────────────────────────────────
export const ModelRole = {
  Main: "main",
  Auxiliary: "auxiliary",
  Captioning: "captioning",
  Moderation: "moderation",
  Embeddings: "embeddings",
  Summarization: "summarization",
} as const;
export type ModelRole = (typeof ModelRole)[keyof typeof ModelRole];

// ── Encryption Levels ─────────────────────────────────────
export const EncryptionLevel = {
  None: "none",
  Standard: "standard",
  Private: "private",
} as const;
export type EncryptionLevel = (typeof EncryptionLevel)[keyof typeof EncryptionLevel];
