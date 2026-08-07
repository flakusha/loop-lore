import { apiFetch, } from "./../htmx";
import { log as rootLog, } from "./../logger";
import type { ChatState, } from "./../types";

const log = rootLog.child({ module: "mood", },);

export const moodStateEmotions: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Load active emotions for the current character and join them with global
   * emotion definitions so the template can render each emotion chip.
   * Populates _activeEmotions with { def: { id, icon, display_name }, intensity }.
   */
  async loadEmotions() {
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }
    this._activeEmotionsLoading = true;
    try {
      const [activeRes, defsRes,] = await Promise.allSettled([
        apiFetch(`/api/actors/${actorId}/emotions`,),
        apiFetch(`/api/emotions`,),
      ],);
      if (activeRes.status !== "fulfilled" || defsRes.status !== "fulfilled") {
        throw new Error("emotion load failed",);
      }
      if (!activeRes.value.ok || !defsRes.value.ok) { return; }

      const active = await activeRes.value.json();
      const defs = await defsRes.value.json();

      const defMap = new Map<string, { id: string; icon: string | null; display_name: string }>();
      const defList = Array.isArray(defs,) ? defs : defs?.data ?? [];
      for (const d of defList) {
        defMap.set(d.id, { id: d.id, icon: d.icon ?? null, display_name: d.display_name, },);
      }

      const activeList = Array.isArray(active,) ? active : active?.data ?? [];
      const outEmotions: typeof this._activeEmotions = [];
      for (const e of activeList) {
        const def = defMap.get(e.emotion_id,);
        if (def) {
          outEmotions.push({ def, intensity: e.intensity ?? 0.5, },);
        }
      }
      this._activeEmotions = outEmotions;
    } catch (error) {
      log.error("Failed to load active emotions", error instanceof Error ? error : undefined, {},);
    } finally {
      this._activeEmotionsLoading = false;
    }
  },

  /** Get the active emotions list (joined with definitions). */
  getActiveEmotions() {
    return this._activeEmotions;
  },
};
