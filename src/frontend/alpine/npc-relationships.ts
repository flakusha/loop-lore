// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Relationships panel state plugin — real data from the relationships API.
 *
 * Spread into the NPC management component (npc.ts). The parent world-edit
 * scope provides `worldId` at runtime (Alpine scope chain); it narrows the
 * relationship query to this world's rows.
 * @module frontend/alpine/npc-relationships
 */

import type {
  ActorRelationshipRow,
  ActorSummary,
  RelationshipDisplayRow,
} from "./chat-types/npc";
import { t, } from "./i18n";
import { npcDisplay, } from "./npc-display";
import {
  fetchActorRelationships,
  fetchRelationshipCast,
} from "./npc-relationships-api";

/** State slice for the relationships sub-panel. */
export interface NpcRelationshipsState {
  /** Cast list backing the actor picker (id + display name). */
  cast: ActorSummary[];
  /** Real relationship rows for the selected actor. */
  relationships: ActorRelationshipRow[];
  /** Actor whose relationships are shown (null → first cast entry). */
  relationshipActorId: string | null;
  loadingRelationships: boolean;
  relationshipsError: string;
  /** Provided by the parent world-edit scope at runtime. */
  worldId?: string;

  /** Load (or reload) the cast + selected actor's relationships. */
  loadRelationships(): Promise<void>;
  /** Display rows with target names resolved. */
  relationshipRows(): RelationshipDisplayRow[];
}

export const npcRelationshipsPanel: NpcRelationshipsState = {
  cast: [],
  relationships: [],
  relationshipActorId: null,
  loadingRelationships: false,
  relationshipsError: "",

  async loadRelationships() {
    if (this.loadingRelationships) { return; }
    this.loadingRelationships = true;
    this.relationshipsError = "";
    try {
      if (this.cast.length === 0) {
        const cast = await fetchRelationshipCast();
        if (!cast) {
          this.relationships = [];
          this.relationshipsError = t("npc.relationshipsLoadError",);
          return;
        }

        this.cast = cast;
      }

      const actorId = this.relationshipActorId ?? this.cast[0]?.id ?? null;
      this.relationshipActorId = actorId;
      if (!actorId) {
        this.relationships = [];
        return;
      }

      const rows = await fetchActorRelationships(actorId, this.worldId || undefined,);
      if (!rows) {
        this.relationships = [];
        this.relationshipsError = t("npc.relationshipsLoadError",);
        return;
      }

      this.relationships = rows;
    } finally {
      this.loadingRelationships = false;
    }
  },

  relationshipRows(): RelationshipDisplayRow[] {
    const names = new Map(Array.from(this.cast, (a,) => [a.id, a.display_name,],),);
    return npcDisplay.relationshipRows(this.relationships, {
      resolveName: (id,) => names.get(id,) ?? "",
      unknownLabel: t("npc.relationshipsUnknownActor",),
    },);
  },
};
