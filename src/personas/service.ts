// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Personas Service
 *
 * CRUD operations for user personas: identities that users adopt in chats.
 */
import type { Kysely, } from "kysely";
import { DefaultState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";

export interface CreatePersonaParams {
  userId: string;
  name: string;
  avatarAssetId?: string | null;
  description?: string | null;
  title?: string | null;
}

export interface UpdatePersonaParams {
  name?: string;
  avatarAssetId?: string | null;
  description?: string | null;
  title?: string | null;
  isDefault?: boolean;
}

export class PersonasService {
  constructor(private readonly db: Kysely<DB>,) {}

  async listByUser(userId: string,) {
    return this.db
      .selectFrom("personas",)
      .selectAll()
      .where("user_id", "=", userId,)
      .orderBy("is_default", "desc",)
      .orderBy("created_at", "desc",)
      .execute();
  }

  async getById(id: string, userId: string,) {
    return this.db
      .selectFrom("personas",)
      .selectAll()
      .where("id", "=", id,)
      .where("user_id", "=", userId,)
      .executeTakeFirst();
  }

  async create(params: CreatePersonaParams,): Promise<string> {
    const id = uid();
    await this.db
      .insertInto("personas",)
      .values({
        id,
        user_id: params.userId,
        name: params.name,
        avatar_asset_id: params.avatarAssetId ?? null,
        description: params.description ?? null,
        title: params.title ?? null,
      },)
      .execute();
    return id;
  }

  async update(id: string, params: UpdatePersonaParams, userId: string,): Promise<void> {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), };
    if (params.name !== undefined) { updates.name = params.name; }
    if (params.avatarAssetId !== undefined) { updates.avatar_asset_id = params.avatarAssetId; }
    if (params.description !== undefined) { updates.description = params.description; }
    if (params.title !== undefined) { updates.title = params.title; }
    if (params.isDefault !== undefined) {
      updates.is_default = params.isDefault ? DefaultState.Default : DefaultState.NotDefault;
    }

    await this.db
      .updateTable("personas",)
      .set(updates,)
      .where("id", "=", id,)
      .where("user_id", "=", userId,)
      .execute();
  }

  async delete(id: string, userId: string,): Promise<void> {
    await this.db.deleteFrom("personas",).where("id", "=", id,).where("user_id", "=", userId,).execute();

    // Remove persona reference from chat_participants
    await this.db
      .updateTable("chat_participants",)
      .set({ persona_id: null, },)
      .where("persona_id", "=", id,)
      .execute();
  }

  async setDefault(id: string, userId: string,): Promise<void> {
    // Unset current default
    await this.db
      .updateTable("personas",)
      .set({ is_default: DefaultState.NotDefault, },)
      .where("user_id", "=", userId,)
      .execute();

    // Set new default
    await this.db
      .updateTable("personas",)
      .set({ is_default: DefaultState.Default, updated_at: new Date().toISOString(), },)
      .where("id", "=", id,)
      .where("user_id", "=", userId,)
      .execute();
  }

  async getDefault(userId: string,) {
    return this.db
      .selectFrom("personas",)
      .selectAll()
      .where("user_id", "=", userId,)
      .where("is_default", "=", DefaultState.Default,)
      .executeTakeFirst();
  }

  async convertToCharacter(id: string, userId: string,): Promise<{ actorId: string }> {
    const persona = await this.db
      .selectFrom("personas",)
      .selectAll()
      .where("id", "=", id,)
      .where("user_id", "=", userId,)
      .executeTakeFirst();

    if (!persona) {
      getLogger()
        .child({ module: "personas", },)
        .warn("Persona not found for conversion", { personaId: id, userId, },);
      throw new Error("Persona not found",);
    }

    const actorId = uid();
    await this.db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: persona.name,
        user_id: null,
        owner_id: userId,
        avatar_asset_id: persona.avatar_asset_id,
        description: persona.description,
        system_prompt: null,
        agent_type: "ai",
        settings: "{}",
        format_version: 0,
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
      },)
      .execute();

    return { actorId, };
  }
}
