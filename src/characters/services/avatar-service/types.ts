// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";

/** Options for creating an avatar */
export interface CreateAvatarOpts {
  actorId: string;
  assetId: string;
  label: string;
  tags?: Partial<Record<AvatarTagType, string>>;
  isPrimary?: boolean;
  sortOrder?: number;
  /** Outfit variant dimension; omit for base/outfitless variants. */
  outfitId?: string;
}

/** Options for updating an avatar */
export interface UpdateAvatarOpts {
  label?: string;
  tags?: Partial<Record<AvatarTagType, string>>;
  isPrimary?: boolean;
  sortOrder?: number;
  /** Re-point the variant at another outfit; null detaches it. */
  outfitId?: string | null;
}

/** Avatar with parsed tags */
export interface Avatar {
  id: string;
  actorId: string;
  assetId: string;
  label: string;
  tags: Partial<Record<AvatarTagType, string>>;
  isPrimary: boolean;
  sortOrder: number;
  /** Outfit variant dimension; null = base/outfitless variant. */
  outfitId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Avatar selection config */
export interface AvatarConfig {
  id: string;
  actorId: string;
  selectionRule: AvatarSelectionRule;
  weights: Record<AvatarTagType, number>;
  fallbackChain: AvatarTagType[];
  createdAt: string;
  updatedAt: string;
}

/** Context for avatar selection */
export interface AvatarSelectionContext {
  emotion?: string;
  mood?: string;
  action?: string;
  location?: string;
  time?: string;
  outfit?: string;
  /** Explicit outfit id; null forces base (outfitless) mode. */
  outfitId?: string | null;
  /** Chat id for chat-scoped outfit override lookup. */
  chatId?: string;
  /** Location id for location→outfit rule lookup. */
  locationId?: string;
}
