// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * List half of the Builder tab: fetch chains + available templates, and
 * delete one chain. Actions re-read the list rather than patching local
 * state (server reorders by `updated_at`).
 */
import { BUILDER_PATH, log, TEMPLATES_PATH, } from "./shared";
import type { BuilderChain, BuilderTemplate, ComfyuiBuilder, } from "./types";

export const builderListState: Partial<ComfyuiBuilder> & ThisType<ComfyuiBuilder> = {
  chains: [],
  loadingChains: false,
  chainsError: "",
  templates: [],
  confirmDeleteChain: "",

  /** @returns {Promise<void>} */
  async init() {
    await this.loadChains();
    await this.loadTemplates();
  },

  /** @returns {Promise<void>} */
  async loadChains() {
    this.loadingChains = true;
    try {
      const res = await apiFetch(`${BUILDER_PATH}/chains`, {
        headers: { Accept: "application/json", },
      },);

      if (res.ok) {
        const data = await res.json() as { chains?: BuilderChain[] };
        this.chains = Array.isArray(data.chains,) ? data.chains : [];
        this.chainsError = "";
      } else {
        this.chainsError = "Failed to load chains";
      }
    } catch {
      log.warn("Network error loading builder chains",);
      this.chainsError = "Network error loading chains";
    } finally {
      this.loadingChains = false;
    }
  },

  /** @returns {Promise<void>} */
  async loadTemplates() {
    try {
      const res = await apiFetch(TEMPLATES_PATH, {
        headers: { Accept: "application/json", },
      },);

      if (res.ok) {
        const data = await res.json() as { data?: BuilderTemplate[] };
        this.templates = Array.isArray(data.data,) ? data.data : [];
      }
    } catch {
      log.warn("Network error loading builder templates",);
    }
  },

  /** @param {string} id @returns {Promise<void>} */
  async deleteChain(id: string,) {
    try {
      const res = await apiFetch(`${BUILDER_PATH}/chains/${id}`, { method: "DELETE", },);
      if (res.ok) {
        this.confirmDeleteChain = "";
        showToast("success", `Chain deleted`,);
        await this.loadChains();
      } else {
        showToast("error", "Failed to delete chain",);
      }
    } catch {
      showToast("error", "Network error deleting chain",);
    }
  },
};
