// ── Chat location (change / transfer / join at location) — panel ─
//
// Location controls surface for the active chat. It lists the world's
// locations, lets the user change the chat's current location (PUT
// /api/chats/:id/location), transfer the chat to a location (POST
// /api/chats/:id/transfer), and discover/join other chats already at a
// selected location (GET /api/chats/joinable + POST /api/chats/:id/join).
// This module only drives existing endpoints — no location access-check
// logic is modified.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-location", },);

/** A location row returned by the location explorer endpoint. */
export interface ChatLocationRow {
  id: string;
  name: string;
  description: string | null;
}

const LOCATION_CHANGED_EVENT = "chat:location-changed";

export const chatLocation: Partial<ChatState> & ThisType<ChatState> = {
  _locations: [] as ChatLocationRow[],
  _locationsLoading: false,
  _locationOpen: false,
  _selectedLocationId: "" as string,
  _chatWorldId: null as string | null,
  _chatCurrentLocationId: null as string | null,
  _chatRecentLocationChanged: false,
  _locationBusy: false,
  _locationJoinableChats: [] as {
    chatId: string;
    chatName: string;
    participantCount: number;
    lastActiveAt: string | null;
  }[],

  toggleLocationPanel() {
    this._locationOpen = !this._locationOpen;
    if (this._locationOpen && this.activeChat) {
      this.loadLocations();
    }
  },

  /** Load the world's locations and chat metadata for the active chat. */
  async loadLocations() {
    if (!this.activeChat) { return; }
    this._locationsLoading = true;
    try {
      const worldId = await this._locationWorldId();
      if (!worldId) {
        this._locations = [];
        return;
      }
      const res = await apiFetch(`/api/worlds/${worldId}/location-explorer`,);
      if (res.ok) {
        const body = await res.json();
        const data = (body?.data ?? {}) as { locations?: ChatLocationRow[] };
        this._locations = data.locations ?? [];
        if (!this._selectedLocationId && this._locations.length > 0) {
          this._selectedLocationId = this._chatCurrentLocationId ?? (this._locations[0]?.id ?? "");
        }
      } else {
        this._locations = [];
      }
      await this.loadLocationJoinable();
    } catch (error) {
      log.warn("loadLocations failed", { error: String(error,), },);
      this._locations = [];
    } finally {
      this._locationsLoading = false;
    }
  },

  /**
   * Resolve the active chat's world id (and current location), preferring the
   * already-loaded chat row and falling back to the chat detail endpoint.
   */
  async _locationWorldId(): Promise<string | null> {
    if (this._chatWorldId) { return this._chatWorldId; }
    const current = this.currentChat as {
      world_id?: string | null;
      current_location_id?: string | null;
    } | null;
    if (current?.world_id) {
      this._chatWorldId = current.world_id;
      this._chatCurrentLocationId = current.current_location_id ?? null;
      return current.world_id;
    }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}`,);
      if (!res.ok) { return null; }
      const chat = await res.json();
      this._chatWorldId = (chat?.world_id as string | null) ?? null;
      this._chatCurrentLocationId = (chat?.current_location_id as string | null) ?? null;
      return this._chatWorldId;
    } catch (error) {
      log.warn("resolve chat world_id failed", { error: String(error,), },);
      return null;
    }
  },

  get selectedLocationName() {
    return this._locations.find((l,) => l.id === this._selectedLocationId)?.name ?? null;
  },

  get currentLocationName() {
    return this._locations.find((l,) => l.id === this._chatCurrentLocationId)?.name ?? null;
  },

  /**
   * Change the chat's current location in place (PUT /api/chats/:id/location).
   * Ownership-gated server-side; only applies when a different location is chosen.
   */
  async changeChatLocation() {
    if (!this.activeChat || !this._selectedLocationId || this._locationBusy) { return; }
    if (this._selectedLocationId === this._chatCurrentLocationId) {
      this.$dispatch?.("show-toast", { type: "info", message: t("toasts.chatAlreadyInLocation",), },);
      return;
    }
    this._locationBusy = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ locationId: this._selectedLocationId, },),
      },);
      if (res.ok) {
        this._chatCurrentLocationId = this._selectedLocationId;
        this._chatRecentLocationChanged = true;
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.locationUpdated",), },);
        this._emitLocationChanged();
        // Reflect the new location in the chat list, background auto-sync, and
        // the joinable-at-location discovery list.
        const reload = await Promise.allSettled([this.loadChats?.(), this.loadBackground?.(),],);
        if (reload.some((r,) => r.status === "rejected")) { throw new Error("chat reload failed",); }
        await this.loadLocationJoinable();
        globalThis.setTimeout(() => {
          this._chatRecentLocationChanged = false;
        }, 2500,);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedChangeLocation",), },);
      }
    } catch (error) {
      log.warn("changeChatLocation failed", { error: String(error,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedChangeLocation",), },);
    } finally {
      this._locationBusy = false;
    }
  },

  /**
   * Transfer the chat to a location (POST /api/chats/:id/transfer).
   * Participant-gated server-side; validates the location is in the chat's world.
   */
  async transferChatLocation() {
    if (!this.activeChat || !this._selectedLocationId || this._locationBusy) { return; }
    this._locationBusy = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ locationId: this._selectedLocationId, },),
      },);
      if (res.ok) {
        this._chatCurrentLocationId = this._selectedLocationId;
        this._chatRecentLocationChanged = true;
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.chatTransferred",), },);
        this._emitLocationChanged();
        const reload = await Promise.allSettled([this.loadChats?.(), this.loadBackground?.(),],);
        if (reload.some((r,) => r.status === "rejected")) { throw new Error("chat reload failed",); }
        await this.loadLocationJoinable();
        globalThis.setTimeout(() => {
          this._chatRecentLocationChanged = false;
        }, 2500,);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedTransferChat",), },);
      }
    } catch (error) {
      log.warn("transferChatLocation failed", { error: String(error,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedTransferChat",), },);
    } finally {
      this._locationBusy = false;
    }
  },

  /** Load discoverable chats already at the selected location. */
  async loadLocationJoinable() {
    if (!this._selectedLocationId) {
      this._locationJoinableChats = [];
      return;
    }
    try {
      const res = await apiFetch(
        `/api/chats/joinable?location=${encodeURIComponent(this._selectedLocationId,)}`,
      );
      if (!res.ok) {
        this._locationJoinableChats = [];
        return;
      }
      const body = await res.json();
      const data = Array.isArray(body,)
        ? body
        : (body as {
          data?: { chatId: string; chatName: string; participantCount: number; lastActiveAt: string | null }[];
        }).data ?? [];
      this._locationJoinableChats = Array.from(data, (r,) => ({
        chatId: r.chatId as string,
        chatName: r.chatName as string,
        participantCount: (r.participantCount as number) ?? 0,
        lastActiveAt: (r.lastActiveAt as string | null) ?? null,
      }),);
    } catch (error) {
      log.warn("loadLocationJoinable failed", { error: String(error,), },);
      this._locationJoinableChats = [];
    }
  },

  /** Join a discovered chat, then refresh the location-scoped list. */
  async joinLocationChat(chatId: string,) {
    await this.joinChat(chatId,);
    await this.loadLocationJoinable();
  },

  /** Broadcast a location change so the VN renderer can trigger a transition. */
  _emitLocationChanged() {
    globalThis.dispatchEvent(
      new CustomEvent(LOCATION_CHANGED_EVENT, {
        detail: {
          chatId: this.activeChat,
          locationId: this._selectedLocationId,
          locationName: this.selectedLocationName,
        },
      },),
    );
  },
};
