// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-header outfit switcher (TASK-wardrobe-manager-ui-and-chat-outfit-switcher).
 *
 * Dropdown in the chat header listing the current character's wardrobe;
 * selecting an outfit persists the chat/scene override (top rung of the
 * selection ladder). Reads state the same way `context-window` does: the
 * `chatState()` Alpine scope + the `chat-context-refresh` event.
 *
 * Drives:
 *   GET  /api/v1/actors/:actorId/wardrobe
 *   GET  /api/v1/chats/:chatId/wardrobe-override/:actorId
 *   PUT  /api/v1/chats/:chatId/wardrobe-override
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "chat-outfit-switcher", },);

/** One wardrobe entry in the switcher dropdown. */
interface SwitcherOutfit {
  id: string;
  name: string;
}

(globalThis as unknown as Record<string, unknown>).outfitSwitcher = function() {
  return {
    chatId: null as string | null,
    actorId: null as string | null,
    outfits: [] as SwitcherOutfit[],
    /** Current override outfit id, or null when the scene default applies. */
    overrideId: null as string | null,
    loading: false,
    saving: false,
    error: "",
    open: false,
    _refreshHandler: null as ((evt: Event,) => void) | null,

    /**
     * Human label for the currently active selection.
     * @returns {string}
     */
    get currentLabel(): string {
      if (this.overrideId) {
        const found = this.outfits.find((o,) => o.id === this.overrideId);
        if (found) { return found.name; }
      }
      return t("wardrobe.sceneDefault",);
    },

    /**
     * Resolve the active chat + character actor from the chatState scope.
     * @returns {Promise<void>}
     */
    async load(): Promise<void> {
      const chatRoot = document.querySelector<HTMLElement>("[x-data='chatState()']",);
      if (!chatRoot || typeof Alpine === "undefined") { return; }
      const data = Alpine.$data(chatRoot,) as {
        activeChat?: string | null;
        currentCharacter?: { id?: string } | null;
      };
      const chatId = data.activeChat ?? null;
      const actorId = data.currentCharacter?.id ?? null;
      this.chatId = chatId;
      this.actorId = actorId;
      if (!chatId || !actorId) {
        this.outfits = [];
        this.overrideId = null;
        return;
      }
      this.loading = true;
      this.error = "";
      try {
        const [itemsRes, overrideRes,] = await Promise.allSettled([
          apiFetch(`/api/v1/actors/${actorId}/wardrobe`,),
          apiFetch(`/api/v1/chats/${chatId}/wardrobe-override/${actorId}`,),
        ],);
        // Rejections keep the old Promise.all semantics: surface error.
        if (itemsRes.status === "rejected") { throw itemsRes.reason; }
        if (overrideRes.status === "rejected") { throw overrideRes.reason; }
        this.outfits = itemsRes.value.ok
          ? ((await itemsRes.value.json()) as SwitcherOutfit[]).map((o,) => ({ id: o.id, name: o.name, }))
          : [];
        this.overrideId = overrideRes.value.ok
          ? ((await overrideRes.value.json()) as { outfit_id: string | null }).outfit_id
          : null;
      } catch (error) {
        log.error("Failed to load outfit switcher", error instanceof Error ? error : undefined, {},);
        this.error = t("status.wardrobeLoadFailed",);
      } finally {
        this.loading = false;
      }
    },

    /**
     * Persist the chat/scene outfit override (null clears to scene default).
     * @param outfitId - Outfit to switch to, or null for the scene default
     * @returns {Promise<void>}
     */
    async select(outfitId: string | null,): Promise<void> {
      if (!this.chatId || !this.actorId) { return; }
      this.saving = true;
      this.error = "";
      try {
        const res = await apiFetch(`/api/v1/chats/${this.chatId}/wardrobe-override`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ actor_id: this.actorId, outfit_id: outfitId, },),
        },);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          this.error = body.message ?? t("status.wardrobeSaveFailed",);
          return;
        }
        this.overrideId = outfitId;
        this.open = false;
      } catch (error) {
        log.error("Failed to switch outfit", error instanceof Error ? error : undefined, {},);
        this.error = t("status.wardrobeSaveFailed",);
      } finally {
        this.saving = false;
      }
    },

    /** Subscribe to chat load/switch events so the dropdown follows the chat. */
    init(): void {
      this._refreshHandler = () => {
        void this.load();
      };
      document.addEventListener("chat-context-refresh", this._refreshHandler,);
      void this.load();
    },

    /** Remove the refresh listener (belt-and-suspenders on unmount). */
    destroy(): void {
      if (this._refreshHandler) {
        document.removeEventListener("chat-context-refresh", this._refreshHandler,);
      }
    },
  };
};
