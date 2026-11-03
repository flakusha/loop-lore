// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state mutation methods (world-states CRUD, NPC-state GET/PUT with
 * optimistic update, story turn by-id lookup).
 *
 * Spread into the story-state component record alongside `loaders`; methods
 * use `this` and write component state directly. Deterministic helpers are
 * exported for colocated tests.
 */

import { fetchNpcState, putNpcState, } from "./npc-state-api";
import { fetchStoryTurnById, } from "./turn-by-id-api";
import type {
  NpcStateDraft,
  NpcStatePatch,
  StoryStateComponent,
} from "./types";
import { createWorldState, fetchWorldStates, } from "./world-states-api";

/** Roles allowed to manage world state (mirrors the backend owner/GM gate). */
const MANAGER_ROLES = new Set(["admin", "solo",],);

/**
 * Build the PUT patch from the string-typed form draft. Only non-empty,
 * changed fields are included (backend schema requires minProperties: 1).
 * @param draft
 * @param current current committed values, so unchanged fields are omitted
 * @returns {NpcStatePatch} empty when nothing changed or nothing parses
 */
export function npcPatchFromDraft(
  draft: NpcStateDraft,
  current: { health: number; mentalState: string; locationId: string | null },
): NpcStatePatch {
  const patch: NpcStatePatch = {};
  const health = Number.parseInt(draft.health, 10,);
  if (draft.health !== "" && Number.isFinite(health,) && health !== current.health) {
    patch.health = health;
  }

  const mentalState = draft.mentalState.trim();
  if (mentalState !== "" && mentalState !== current.mentalState) {
    patch.mentalState = mentalState;
  }

  const locationId = draft.locationId.trim();
  if (locationId !== "" && locationId !== (current.locationId ?? "")) {
    patch.locationId = locationId;
  }

  return patch;
}

/** Backend mutation methods for the story-state component (bound via `this`). */
export const mutations = {
  /**
   * True when the viewer may create world states (owner/GM gate, best-effort
   * mirror of the backend `can(userRole, "admin.world") || owner` check).
   * @param {StoryStateComponent} this
   * @returns {boolean}
   */
  canManageWorld(this: StoryStateComponent,): boolean {
    try {
      const alpine = (globalThis as { Alpine?: { store: (n: string,) => Record<string, unknown> } }).Alpine;
      const role = alpine?.store("ui",)?.userRole as string | undefined;
      return role !== undefined && MANAGER_ROLES.has(role,);
    } catch {
      return false;
    }
  },

  /**
   * Load the world-states page for the story's world.
   * @param {StoryStateComponent} this
   * @returns {Promise<void>}
   */
  async loadWorldStates(this: StoryStateComponent,): Promise<void> {
    const worldId = this._worldId;
    if (!worldId) { return; }
    const page = await fetchWorldStates(worldId,);
    this.worldStates = page.data;
    this.worldStatesTotal = page.total;
  },

  /**
   * Create a world-state snapshot from the form description, then refresh
   * the list.
   * @param {StoryStateComponent} this
   * @param description
   * @returns {Promise<void>}
   */
  async addWorldState(this: StoryStateComponent, description: string,): Promise<void> {
    const worldId = this._worldId;
    const trimmed = description.trim();
    if (!worldId || !trimmed) { return; }
    const id = await createWorldState(worldId, { description: trimmed, },);
    if (id === null) {
      this.notify("World state creation failed", "error",);
      return;
    }

    await this.loadWorldStates();
    this.notify("World state created",);
  },

  /**
   * Load one NPC's story state and seed the edit draft.
   * @param {StoryStateComponent} this
   * @param actorId
   * @returns {Promise<void>}
   */
  async loadNpcState(this: StoryStateComponent, actorId: string,): Promise<void> {
    const worldId = this._worldId;
    if (!worldId) { return; }
    const row = await fetchNpcState(worldId, actorId,);
    this.npcState = row;
    this.npcStateActorId = row ? actorId : null;
    this.npcDraft = {
      health: row ? String(row.health,) : "",
      mentalState: row?.mental_state ?? "",
      locationId: row?.location_id ?? "",
    };
  },

  /**
   * Save the NPC-state draft optimistically: apply the parsed patch to the
   * visible row immediately and revert to the server-written row on failure.
   * @param {StoryStateComponent} this
   * @returns {Promise<void>}
   */
  async saveNpcState(this: StoryStateComponent,): Promise<void> {
    const worldId = this._worldId;
    const actorId = this.npcStateActorId;
    const before = this.npcState;
    if (!worldId || !actorId || !before) { return; }

    const patch = npcPatchFromDraft(this.npcDraft, {
      health: before.health,
      mentalState: before.mental_state,
      locationId: before.location_id,
    },);

    if (Object.keys(patch,).length === 0) { return; }

    // Optimistic: mirror the patch onto the visible row before the round-trip.
    this.npcState = {
      ...before,
      ...(patch.health !== undefined ? { health: patch.health, } : {}),
      ...(patch.mentalState !== undefined ? { mental_state: patch.mentalState, } : {}),
      ...(patch.locationId !== undefined ? { location_id: patch.locationId, } : {}),
    };

    const written = await putNpcState(worldId, actorId, patch,);
    if (written === null) {
      this.npcState = before;
      this.notify("NPC state update failed", "error",);
      return;
    }

    this.npcState = written;
    this.notify("NPC state updated",);
  },

  /**
   * Load a story turn by id into the detail view (cached per chatId+turnId).
   * @param {StoryStateComponent} this
   * @param turnId
   * @returns {Promise<void>}
   */
  async loadStoryTurn(this: StoryStateComponent, turnId: string,): Promise<void> {
    const chatId = this.chatId;
    if (!chatId || !turnId.trim()) { return; }
    this.turnDetailLoading = true;
    try {
      const turn = await fetchStoryTurnById(chatId, turnId.trim(),);
      if (turn === null) {
        this.notify("Story turn not found", "error",);
        return;
      }

      this.turnDetail = turn;
    } finally {
      this.turnDetailLoading = false;
    }
  },
};
