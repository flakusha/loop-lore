// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Header transition-mode picker (TASK-chat-feature-location-transition-transfer
 * remainder — AC1 mode chooser + AC6 header affordance).
 *
 * Three modes over existing endpoints, destination = a world location:
 * - `in-place` — PUT /chats/:id/location through the existing
 *   `changeChatLocation` (same chat, new location).
 * - `new-chat` — POST /chats/:id/migrate carrying participants, memory,
 *   world-state and game state but NOT the message log: a fresh chat rooted
 *   at the destination; its location is then set and the UI switches to it.
 * - `isolate` — POST /chats/:id/migrate carrying the full history, sections,
 *   game state, pins and memory: the current context becomes a
 *   destination-locked shard; the source chat stays a read-only branch.
 *
 * Both migrate-backed modes need the chat's own setup template (migrate is
 * template-scoped); without one only the in-place move is offered.
 *
 * Display state lives on `$store.ui` because the chat header sits outside
 * the chatState x-data scope — mirrors `chat-side-channels.ts`.
 */
import { awaitChatStateAction, callChatStateAction, } from "./chat-state-global";
import type { TransitionMode, TransitionPickerState, } from "./chat-types/transition-picker-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-transition", },);

/** Carry flags for the migrate-backed picker modes (AC2/AC3). */
interface MigrateCarry {
  participants?: boolean;
  memory?: boolean;
  worldState?: boolean;
  state?: boolean;
  history?: "none" | "summary" | "full";
  location?: boolean;
  pins?: boolean;
}

const MIGRATE_CARRY: Record<Exclude<TransitionMode, "in-place">, MigrateCarry> = {
  // New chat at destination: continuity of people/memory/world, no log.
  "new-chat": { participants: true, memory: true, worldState: true, state: true, },
  // Isolation shard: full context locked to the destination.
  "isolate": { history: "full", location: true, state: true, pins: true, memory: true, },
};

type TransitionCtx = ChatState & TransitionPickerState;

/**
 * Patch header display state on the shared `ui` store (no-op pre-init).
 * @param patch - Fields to assign
 */
function setUi(patch: Record<string, unknown>,): void {
  if (typeof Alpine === "undefined") { return; }
  try {
    Object.assign(Alpine.store("ui",) as Record<string, unknown>, patch,);
  } catch {
    /* store not ready */
  }
}

/**
 * Read a field from the shared `ui` store with a fallback.
 * @param name - Store field
 * @param fallback - Value when the store is unavailable
 * @returns {T}
 */
function uiField<T,>(name: string, fallback: T,): T {
  if (typeof Alpine === "undefined") { return fallback; }
  try {
    const value = (Alpine.store("ui",) as Record<string, unknown>)[name];
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Toast the generic transition failure. Used by every failure branch of
 * `transitionPicker.runLocationTransition`.
 * @param ctx - The chatState action context carrying `$dispatch`.
 * @param ctx.$dispatch
 */
function failTransition(ctx: { $dispatch?: (event: string, detail: Record<string, unknown>,) => void },): void {
  ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.transitionFailed",), },);
}

export const transitionPicker: Partial<TransitionPickerState> & ThisType<TransitionCtx> = {
  /**
   * Open/close the header dropdown; on open, load the world's locations
   * (existing location machinery) and mirror them into `$store.ui`.
   */
  async toggleTransitionPicker() {
    if (typeof Alpine === "undefined") { return; }
    const store = Alpine.store("ui",) as Record<string, unknown> | undefined;
    if (!store) { return; }
    store.showTransitionPicker = !store.showTransitionPicker;
    if (!store.showTransitionPicker) { return; }
    if (!this.activeChat) {
      store.showTransitionPicker = false;
      return;
    }

    await this.loadLocations();
    setUi({
      transitionLocations: this._locations.map((l,) => ({ id: l.id, name: l.name, })),
      transitionDestinationId: this._selectedLocationId || this._chatCurrentLocationId || "",
    },);
  },

  /**
   * Run one picker mode against `$store.ui.transitionDestinationId`.
   * @param mode - Which transition the user picked
   */
  async runLocationTransition(mode: TransitionMode,) {
    const destinationId = uiField<string>("transitionDestinationId", "",);
    if (!this.activeChat || !destinationId) {
      this.$dispatch?.("show-toast", { type: "info", message: t("toasts.transitionNoDestination",), },);
      return;
    }

    if (uiField<boolean>("transitionBusy", false,)) { return; }
    setUi({ transitionBusy: true, },);

    try {
      if (mode === "in-place") {
        this._selectedLocationId = destinationId;
        // changeChatLocation owns the PUT, its toasts, and the reloads.
        await this.changeChatLocation();
        setUi({ showTransitionPicker: false, },);
        return;
      }

      const detailRes = await apiFetch(`/api/v1/chats/${this.activeChat}`,);
      if (!detailRes.ok) { throw new Error(`chat detail ${String(detailRes.status,)}`,); }
      const detail = await detailRes.json() as { template_id?: string | null };
      const templateId = detail.template_id ?? null;
      if (!templateId) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.transitionNoTemplate",), },);
        return;
      }

      const migrateRes = await apiFetch(
        `/api/v1/chats/${this.activeChat}/migrate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ templateId, carry: MIGRATE_CARRY[mode], },),
        },
      );

      if (!migrateRes.ok) {
        failTransition(this,);
        return;
      }

      const created = await migrateRes.json() as { newChatId?: string };
      const newChatId = created.newChatId ?? "";
      if (!newChatId) {
        failTransition(this,);
        return;
      }

      const locRes = await apiFetch(
        `/api/v1/chats/${newChatId}/location`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ locationId: destinationId, },),
        },
      );

      if (!locRes.ok) {
        // The migration itself succeeded — still switch, but be honest.
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.transitionLocationFailed",), },);
      }

      const selectChat = (this as unknown as Record<string, unknown>).selectChat as
        | ((chatId: string,) => Promise<void>)
        | undefined;

      if (typeof selectChat === "function") { await selectChat.call(this, newChatId,); }
      this.$dispatch?.("show-toast", {
        type: "success",
        message: t(mode === "new-chat" ? "toasts.transitionNewChatDone" : "toasts.transitionIsolateDone",),
      },);

      setUi({ showTransitionPicker: false, },);
    } catch (error) {
      log.warn("location transition failed", { mode, error: String(error,), },);
      failTransition(this,);
    } finally {
      setUi({ transitionBusy: false, },);
    }
  },
};

// Global helpers for the chat-header button (the header lives outside the
// chatState x-data scope) — see chat-state-global.ts.
const g = globalThis as Record<string, unknown>;
g.toggleTransitionPicker = function() {
  void callChatStateAction("toggleTransitionPicker",);
};

g.runLocationTransition = async function(mode: TransitionMode,) {
  await awaitChatStateAction("runLocationTransition", mode,);
};
