// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM panel in-story entity handoff — scans narration for entity suggestions and
 * starts a creation chat. Spread into the gm panel Alpine scope.
 */
import type { EntitySuggestion, } from "./gm-panel-types";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "gm-panel", },);

export const gmPanelEntities = {
  entityKind: "character" as "character" | "location" | "world" | "item",
  entitySeed: "",
  entityMessage: "",
  entitySuggestions: [] as EntitySuggestion[],

  /** Start an in-place entity creation chat (story handoff). */
  async generateEntity() {
    const chatId = (this as any).activeChat;
    if (!chatId || !this.entitySeed.trim()) { return; }
    this.entityMessage = "";
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/generate-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          kind: this.entityKind,
          seed: this.entitySeed.trim(),
        },),
      },);
      if (res.ok) {
        const data = await res.json() as { chatId?: string };
        this.entitySeed = "";
        if (typeof data.chatId === "string") {
          this.entityMessage = "Creation chat started.";
          const navigate = (this as any).selectChat;
          if (typeof navigate === "function") {
            await navigate.call(this, data.chatId,);
          }
        }
      } else {
        const data = await res.json().catch(() => ({}) as { error?: string });
        this.entityMessage = data.error ?? "Failed to start creation chat.";
      }
    } catch (error) {
      log.warn("Failed to start entity creation chat", { error, },);
      this.entityMessage = "Failed to start creation chat.";
    }
  },

  /** Scan recent narration for in-story entity introductions. */
  async loadEntitySuggestions() {
    const chatId = (this as any).activeChat;
    if (!chatId) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/entity-suggestions`, {},);
      if (res.ok) {
        const data = await res.json() as { items?: EntitySuggestion[] };
        this.entitySuggestions = data.items ?? [];
      }
    } catch (error) {
      log.warn("Failed to load entity suggestions", { error, },);
    }
  },

  /** Prefill the seed from a suggestion and start the handoff. */
  async useSuggestion(suggestion: { kind: string; seed: string },) {
    this.entityKind = suggestion.kind as typeof this.entityKind;
    this.entitySeed = suggestion.seed;
    await this.generateEntity();
  },
};
