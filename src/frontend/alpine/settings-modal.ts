// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { autoResize as autoResizeImpl, } from "./auto-resize";
import { jsonBody, } from "./json";

settingsModal = function() {
  return {
    open: false,
    tab: "theme",
    theme: localStorage.getItem("theme-preference",) || "default",
    enterToSend: localStorage.getItem("chat-enter-to-send",) !== "0",
    autoScroll: localStorage.getItem("chat-auto-scroll",) !== "0",
    detailLevel: localStorage.getItem("chat-detail-level",) || "Immersion",
    provider: "OpenAI",
    model: "",
    temperature: 1,
    customInstructions: "",
    comfyModels: null as null | {
      provider: string;
      noVae: boolean;
      clipRole: { candidates: string[]; selected: string | null };
      diffusionRole: { candidates: string[]; selected: string | null };
      vaeRole: { candidates: string[]; selected: string | null };
    },

    /**
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const res = await apiFetch("/api/v1/settings", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const s = await res.json();
          if (s.theme) { this.theme = s.theme; }
          if (s.provider) { this.provider = s.provider; }
          if (s.model) { this.model = s.model; }
          if (typeof s.temperature === "number") { this.temperature = s.temperature; }
          if (s.detailLevel) { this.detailLevel = s.detailLevel; }
          if (typeof s.customInstructions === "string") { this.customInstructions = s.customInstructions; }
        }
      } catch {
        /* ignore */
      }

      await this.loadComfyModels();
    },

    /**
     * @returns {Promise<void>}
     */
    async loadComfyModels() {
      try {
        const res = await apiFetch("/api/v1/comfyui/models", {
          headers: { Accept: "application/json", },
        },);

        if (res.ok) {
          const body = await res.json();
          // provider null = none configured: leave the selector hidden.
          if (body.provider) { this.comfyModels = body; }
        }
      } catch {
        /* unavailable engine — leave the selector hidden */
      }
    },

    /**
     * Persist the visible model choice under users.settings.comfyUiModels.
     * @returns {Promise<void>}
     */
    async saveComfyModels() {
      const models = this.comfyModels;
      if (!models) { return; }
      const selection: Record<string, unknown> = { noVae: models.noVae, };
      for (const role of ["clip", "diffusion", "vae",] as const) {
        const selected = models[`${role}Role`].selected;
        if (selected) { selection[role] = selected; }
      }

      try {
        await apiFetch("/api/v1/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ comfyUiModels: { [models.provider]: selection, }, },),
        },);
      } catch {
        /* ignore */
      }
    },

    /**
     * @param {string} section
     * @returns {Promise<void>}
     */
    async save(section: string,) {
      const payload: Record<string, unknown> = {};
      if (section === "theme" || this.tab === "theme") {
        payload.theme = this.theme;
        await this.applyTheme();
      }

      if (section === "chat" || this.tab === "chat") {
        payload.detailLevel = this.detailLevel;
        localStorage.setItem("chat-enter-to-send", this.enterToSend ? "1" : "0",);
        localStorage.setItem("chat-auto-scroll", this.autoScroll ? "1" : "0",);
        localStorage.setItem("chat-detail-level", this.detailLevel,);
      }

      if (section === "api" || this.tab === "generation") {
        payload.provider = this.provider;
        payload.model = this.model;
        payload.temperature = this.temperature;
        payload.customInstructions = this.customInstructions.trim() || null;
      }

      try {
        await apiFetch("/api/v1/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(payload,),
        },);
      } catch {
        /* ignore */
      }
    },

    /**
     * @returns {void}
     */
    applyTheme() {
      const themes = globalThis.__THEMES ?? [];
      if (themes.every((t: any,) => t.id !== this.theme)) { return; }
      for (const t of themes) {
        const link = document.querySelector("#theme-" + t.id,) as HTMLLinkElement | null;
        if (link) { link.disabled = t.id !== this.theme; }
      }

      document.body.classList.toggle("theme-no-icons", this.theme === "no-icons",);
      localStorage.setItem("theme-preference", this.theme,);
    },

    autoResize(el: HTMLTextAreaElement,) {
      autoResizeImpl(el,);
    },
  };
};
