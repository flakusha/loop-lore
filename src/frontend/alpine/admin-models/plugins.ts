import { t, } from "../i18n";
import { log, } from "./shared";
import type { ModelsState, PluginInfo, } from "./types";

export const pluginState: Partial<ModelsState> & ThisType<ModelsState> = {
  pluginList: [] as PluginInfo[],
  loadingPlugins: false,

  async loadPlugins() {
    this.loadingPlugins = true;
    try {
      const res = await apiFetch("/api/plugins", { headers: { Accept: "application/json", }, },);
      if (res.ok) { this.pluginList = await res.json(); }
    } catch {
      log.warn("Network error loading plugins",);
    } finally {
      this.loadingPlugins = false;
    }
  },
  async togglePlugin(name: string, enable: boolean,) {
    const action = enable ? "enable" : "disable";
    try {
      const res = await apiFetch(`/api/plugins/${name}/${action}`, { method: "POST", },);
      if (res.ok) {
        showToast("success", t(enable ? "toasts.pluginEnabled" : "toasts.pluginDisabled",),);
        await this.loadPlugins();
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
};
