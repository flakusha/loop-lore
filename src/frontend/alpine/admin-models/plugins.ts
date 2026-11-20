// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log, } from "./shared";
import type { DiscoverInfo, ModelsState, PluginInfo, } from "./types";

export const pluginState: Partial<ModelsState> & ThisType<ModelsState> = {
  pluginList: [] as PluginInfo[],
  loadingPlugins: false,
  discoverList: [] as DiscoverInfo[],
  loadingDiscover: false,

  /**
   * @returns {Promise<void>}
   */
  async loadPlugins() {
    this.loadingPlugins = true;
    try {
      const res = await apiFetch("/api/v1/plugins", { headers: { Accept: "application/json", }, },);
      if (res.ok) { this.pluginList = await res.json(); }
    } catch {
      log.warn("Network error loading plugins",);
    } finally {
      this.loadingPlugins = false;
    }
  },
  /**
   * @param {string} name
   * @param {boolean} enable
   * @returns {Promise<void>}
   */
  async togglePlugin(name: string, enable: boolean,) {
    const action = enable ? "enable" : "disable";
    try {
      const res = await apiFetch(`/api/v1/plugins/${name}/${action}`, { method: "POST", },);
      if (res.ok) {
        showToast("success", t(enable ? "toasts.pluginEnabled" : "toasts.pluginDisabled",),);
        await this.loadPlugins();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
  /**
   * @returns {Promise<void>}
   */
  async loadDiscover() {
    this.loadingDiscover = true;
    try {
      const res = await apiFetch("/api/v1/plugins/discover", { headers: { Accept: "application/json", }, },);
      if (res.ok) { this.discoverList = await res.json(); }
    } catch {
      log.warn("Network error discovering plugins",);
    } finally {
      this.loadingDiscover = false;
    }
  },
  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async installPlugin(name: string,) {
    try {
      const res = await apiFetch("/api/v1/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ name, },),
      },);

      if (!res.ok) {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
        return;
      }

      showToast("success", "Plugin installed",);
    } catch {
      showToast("error", t("toasts.networkError",),);
      return;
    }

    await this.loadPlugins();
    await this.loadDiscover();
  },
  /**
   * @param {string} name
   * @returns {Promise<void>}
   */
  async unloadPlugin(name: string,) {
    try {
      const res = await apiFetch(`/api/v1/plugins/${name}`, { method: "DELETE", },);
      if (!res.ok) {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
        return;
      }

      showToast("success", "Plugin unloaded",);
    } catch {
      showToast("error", t("toasts.networkError",),);
      return;
    }

    await this.loadPlugins();
    await this.loadDiscover();
  },
};
