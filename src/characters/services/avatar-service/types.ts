import type { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";

/** Options for creating an avatar */
export interface CreateAvatarOpts {
  actorId: string;
  assetId: string;
  label: string;
  tags?: Partial<Record<AvatarTagType, string>>;
  isPrimary?: boolean;
  sortOrder?: number;
}

/** Options for updating an avatar */
export interface UpdateAvatarOpts {
  label?: string;
  tags?: Partial<Record<AvatarTagType, string>>;
  isPrimary?: boolean;
  sortOrder?: number;
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
}
