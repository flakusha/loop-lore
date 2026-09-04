// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Avatar Service
 *
 * Manages one-to-many avatars with context/mood/action tags
 * and configurable selection rules.
 *
 * The concrete CRUD / selection / config logic lives in isolated dispatcher
 * modules (crud, selection, config, world-config) threaded with an explicit
 * `db` handle. `AvatarService` remains a class so its methods stay on the
 * prototype — `emotion-avatar-service.test.ts` stubs
 * `AvatarService.prototype.createAvatar`, which requires a class.
 */
import type { Kysely, } from "kysely";
import type { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import {
  getAvatarConfig as getAvatarConfigDispatch,
  upsertAvatarConfig as upsertAvatarConfigDispatch,
} from "./config";
import {
  createAvatar as createAvatarDispatch,
  deleteAvatar as deleteAvatarDispatch,
  getAvatar as getAvatarDispatch,
  getAvatars as getAvatarsDispatch,
  updateAvatar as updateAvatarDispatch,
} from "./crud";
import { selectAvatar as selectAvatarDispatch, } from "./selection";
import type {
  Avatar,
  AvatarConfig,
  AvatarSelectionContext,
  CreateAvatarOpts,
  UpdateAvatarOpts,
} from "./types";
import {
  getWorldAvatarConfig as getWorldAvatarConfigDispatch,
  upsertWorldAvatarConfig as upsertWorldAvatarConfigDispatch,
} from "./world-config";

export type {
  Avatar,
  AvatarConfig,
  AvatarSelectionContext,
  CreateAvatarOpts,
  UpdateAvatarOpts,
} from "./types";

/**
 * Character Avatar Service
 *
 * Manages multiple avatars per character with context-aware selection.
 * Avatars are tagged with emotion, mood, action, location, time, and outfit.
 */
export class AvatarService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get all avatars for a character, sorted by sort_order
   * @param actorId
   */
  async getAvatars(actorId: string,): Promise<Avatar[]> {
    return getAvatarsDispatch(this.db, actorId,);
  }

  /**
   * Get a specific avatar by ID
   * @param avatarId
   */
  async getAvatar(avatarId: string,): Promise<Avatar | undefined> {
    return getAvatarDispatch(this.db, avatarId,);
  }

  /**
   * Create a new avatar
   * @param opts
   */
  async createAvatar(opts: CreateAvatarOpts,): Promise<string> {
    return createAvatarDispatch(this.db, opts,);
  }

  /**
   * Update an avatar
   * @param avatarId
   * @param opts
   */
  async updateAvatar(avatarId: string, opts: UpdateAvatarOpts,): Promise<void> {
    return updateAvatarDispatch(this.db, avatarId, opts,);
  }

  /**
   * Delete an avatar
   * @param avatarId
   */
  async deleteAvatar(avatarId: string,): Promise<void> {
    return deleteAvatarDispatch(this.db, avatarId,);
  }

  /**
   * Select the best avatar based on context
   * @param actorId
   * @param context
   * @param worldId
   */
  async selectAvatar(
    actorId: string,
    context: AvatarSelectionContext,
    worldId?: string,
  ): Promise<Avatar | null> {
    return selectAvatarDispatch(this.db, actorId, context, worldId,);
  }

  /**
   * Get avatar config for a character
   * @param actorId
   */
  async getAvatarConfig(actorId: string,): Promise<AvatarConfig | undefined> {
    return getAvatarConfigDispatch(this.db, actorId,);
  }

  /**
   * Create or update avatar config
   * @param actorId
   * @param config
   * @param config.selectionRule
   * @param config.weights
   * @param config.fallbackChain
   */
  async upsertAvatarConfig(
    actorId: string,
    config: {
      selectionRule?: AvatarSelectionRule;
      weights?: Partial<Record<AvatarTagType, number>>;
      fallbackChain?: AvatarTagType[];
    },
  ): Promise<string> {
    return upsertAvatarConfigDispatch(this.db, actorId, config,);
  }

  /**
   * Get world-specific avatar config
   * @param actorId
   * @param worldId
   */
  async getWorldAvatarConfig(actorId: string, worldId: string,) {
    return getWorldAvatarConfigDispatch(this.db, actorId, worldId,);
  }

  /**
   * Create or update world-specific avatar config
   * @param actorId
   * @param worldId
   * @param config
   * @param config.selectionRuleOverride
   * @param config.weightsOverride
   */
  async upsertWorldAvatarConfig(
    actorId: string,
    worldId: string,
    config: {
      selectionRuleOverride?: AvatarSelectionRule;
      weightsOverride?: Partial<Record<AvatarTagType, number>>;
    },
  ): Promise<string> {
    return upsertWorldAvatarConfigDispatch(this.db, actorId, worldId, config,);
  }
}
