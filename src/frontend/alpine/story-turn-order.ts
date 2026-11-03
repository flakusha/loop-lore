// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Turn Order — Alpine component for the story-mode turn queue.
 *
 * Renders the live turn-order snapshot for a story chat: queue from
 * `GET /api/v1/chats/:id/turn-order` (strategy peek, current/next flags —
 * cannot drift from `src/turning/turn-strategies.ts`), initiative values
 * joined from `GET /api/v1/chats/:id/participants` (the snapshot itself does
 * not expose `initiative`). Per-slot action dispatches the existing
 * `POST /api/v1/chats/:id/story/step` with `{ forceActorId }`.
 *
 * Registered as `window.storyTurnOrder`; mounted from the unified GM panel's
 * Story tab. Fails soft: a null snapshot (direct story chats, no AI
 * participants, fetch failure) renders the empty-state hint only.
 */

import type { GroupTurnOrder, TurnOrderSlot, } from "./chat-types/participants-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { storyControl, } from "./story-controls";
import { activeChatId, } from "./story-state/derived";

const log = rootLog.child({ module: "story-turn-order", },);

/** Participant initiative value joined into a slot (subset of GET participants). */
export interface InitiativeRow {
  actor_id: string;
  initiative: number | null;
}

/** A queue slot with its joined initiative value (`null` when unmatched). */
export interface StoryTurnSlot extends TurnOrderSlot {
  initiative: number | null;
}

/**
 * Join participant initiative rows into turn-order slots by actor id.
 * @param order - Slots from the turn-order snapshot
 * @param rows - Initiative values from GET /chats/:id/participants
 * @returns Slots in the same order, each carrying `initiative ?? null`
 */
export function mergeInitiative(order: TurnOrderSlot[], rows: InitiativeRow[],): StoryTurnSlot[] {
  const byActor = new Map(rows.map((r,) => [r.actor_id, r.initiative,]),);
  return order.map((slot,) => ({ ...slot, initiative: byActor.get(slot.actor_id,) ?? null, }));
}

/**
 * Rotate slots acting-first (battle-strip semantics): the current speaker
 * leads, the remaining slots follow in snapshot order wrapping around.
 * Falls back to the snapshot order when there is no current actor or it is
 * no longer among the slots.
 * @param order - Merged slots in snapshot display order
 * @param currentActorId - Current speaker id (may be null)
 * @returns Queue with the current actor first (empty input stays empty)
 */
export function storyQueue(order: StoryTurnSlot[], currentActorId: string | null,): StoryTurnSlot[] {
  const current = currentActorId === null
    ? -1
    : order.findIndex((slot,) => slot.actor_id === currentActorId);

  if (current < 0) { return order; }
  return [...order.slice(current,), ...order.slice(0, current,),];
}

/** The story-turn-order component exposed on `window.storyTurnOrder`. */
export interface StoryTurnOrderComponent {
  /** Live snapshot from GET /turn-order (null when unavailable). */
  snapshot: GroupTurnOrder | null;
  /** Joined initiative rows from GET /participants. */
  initiativeRows: InitiativeRow[];
  /** True while a step request is in flight (disables step buttons). */
  busy: boolean;
  /** Load the snapshot + initiative rows for the active chat. */
  load(): Promise<void>;
  /** Acting-first queue with joined initiative (empty when no snapshot). */
  readonly queue: StoryTurnSlot[];
  /** Snapshot strategy label (raw enum text; null when unavailable). */
  readonly strategy: string | null;
  /** True when the strategy's next pick is deterministic (not `initiative`). */
  readonly nextIsExact: boolean;
  /** Step the story engine with the given actor (`story/step` + forceActorId). */
  stepWith(actorId: string,): Promise<void>;
  /** Persist an initiative change for the given actor. */
  setInitiative(actorId: string, value: number,): Promise<void>;
  /** Fetch and store the turn-order snapshot for a chat. */
  _loadSnapshot(chatId: string,): Promise<void>;
  /** Fetch and store the participant initiative rows for a chat. */
  _loadInitiative(chatId: string,): Promise<void>;
  /** Post a toast via the Alpine event chain (no-op when unavailable). */
  readonly $dispatch?: (event: string, detail: Record<string, unknown>,) => void;
}

(globalThis as unknown as Record<string, unknown>).storyTurnOrder = function(): StoryTurnOrderComponent {
  return {
    snapshot: null,
    initiativeRows: [] as InitiativeRow[],
    busy: false,

    async load(): Promise<void> {
      const chatId = activeChatId();
      if (!chatId) { return; }
      const [snapshot, participants,] = await Promise.allSettled([
        this._loadSnapshot(chatId,),
        this._loadInitiative(chatId,),
      ],);

      for (const result of [snapshot, participants,]) {
        if (result.status === "rejected") {
          log.warn("Story turn-order load failed", { chatId, error: result.reason, },);
        }
      }
    },

    get queue(): StoryTurnSlot[] {
      const merged = mergeInitiative(this.snapshot?.order ?? [], this.initiativeRows,);
      return storyQueue(merged, this.snapshot?.currentActorId ?? null,);
    },

    get strategy(): string | null {
      return this.snapshot?.strategy ?? null;
    },

    get nextIsExact(): boolean {
      return this.snapshot?.strategy !== "initiative";
    },

    async stepWith(actorId: string,): Promise<void> {
      const chatId = activeChatId();
      if (!chatId || !actorId || this.busy) { return; }
      this.busy = true;
      try {
        const result = await storyControl(chatId, "step", { forceActorId: actorId, },);
        if (!result.ok) {
          this.$dispatch?.("show-toast", { type: "error", message: result.message ?? "step failed", },);
          return;
        }

        await this._loadSnapshot(chatId,);
      } finally {
        this.busy = false;
      }
    },

    async setInitiative(actorId: string, value: number,): Promise<void> {
      const chatId = activeChatId();
      if (!chatId || !actorId || !Number.isFinite(value,)) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${chatId}/participants/${actorId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ initiative: value, },),
        },);

        if (res.ok) {
          const row = this.initiativeRows.find((r,) => r.actor_id === actorId);
          if (row) { row.initiative = value; }
          // The strategy peek weights initiative, so refresh the snapshot.
          await this._loadSnapshot(chatId,);
          return;
        }
      } catch (error) {
        log.warn("Initiative update failed", { chatId, actorId, error, },);
      }

      this.$dispatch?.("show-toast", { type: "error", message: t("participants.failedUpdate",), },);
    },

    async _loadSnapshot(chatId: string,): Promise<void> {
      const res = await apiFetch(`/api/v1/chats/${chatId}/turn-order`,);
      if (!res.ok) { return; }
      const body = (await res.json()) as { turnOrder: GroupTurnOrder | null };
      this.snapshot = body.turnOrder ?? null;
    },

    async _loadInitiative(chatId: string,): Promise<void> {
      const res = await apiFetch(`/api/v1/chats/${chatId}/participants`,);
      if (!res.ok) { return; }
      const rows = (await res.json()) as { actor_id: string; initiative: number | null }[];
      this.initiativeRows = rows.map((r,) => ({ actor_id: r.actor_id, initiative: r.initiative, }));
    },
  };
};
