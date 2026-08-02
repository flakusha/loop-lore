import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "mood", },);

export const moodState: Partial<ChatState> & ThisType<ChatState> = {
  _mood: null as {
    happiness: number;
    currentMood: string;
    baseMood: string;
    moodStability: number;
    lastMoodChange: string;
    expressionModifiers: Record<string, number>;
  } | null,
  _moodLoading: false,
  _moodCanEdit: false,
  _moodSliderValue: 50,
  _emotionAvatars: [] as { emotion: string; avatarId: string; assetId: string }[],
  _emotionAvatarsLoading: false,
  _currentEmotionAvatar: null as string | null,

  /** Active emotions for the current character (joined with definitions). */
  _activeEmotions: [] as {
    def: { id: string; icon: string | null; display_name: string };
    intensity: number;
  }[],
  _activeEmotionsLoading: false,

  async loadMood() {
    if (!this.activeChat) { return; }
    this._moodLoading = true;
    try {
      // Get the character (NPC) in this chat
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      const moodRes = await apiFetch(`/api/actors/${npc.actor_id}/mood`,);
      if (moodRes.ok) {
        const mood = await moodRes.json();
        this._mood = {
          happiness: mood.happiness ?? 50,
          currentMood: mood.current_mood ?? "neutral",
          baseMood: mood.base_mood ?? "neutral",
          moodStability: mood.mood_stability ?? 0.5,
          lastMoodChange: mood.last_mood_change ?? "",
          expressionModifiers: mood.expression_modifiers ?? {},
        };
        this._moodSliderValue = this._mood.happiness;
      }

      // Check if user can edit mood (GM or admin role)
      this._moodCanEdit = this.userRole === "admin" || this.userRole === "solo";

      // Load emotion avatars for this character
      await this.loadEmotionAvatars();

      // Load active emotions for this character
      await this.loadEmotions();
    } catch (error) {
      log.error("Failed to load mood", error instanceof Error ? error : undefined, {},);
    } finally {
      this._moodLoading = false;
    }
  },

  async loadEmotionAvatars() {
    if (!this.activeChat) { return; }
    this._emotionAvatarsLoading = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      const avatarsRes = await apiFetch(`/api/actors/${npc.actor_id}/avatars`,);
      if (avatarsRes.ok) {
        const avatars = await avatarsRes.json();
        this._emotionAvatars = avatars
          .filter((a: any,) => a.tags?.emotion)
          .map((a: any,) => ({
            emotion: a.tags.emotion,
            avatarId: a.id,
            assetId: a.asset_id,
          }));

        // Select the avatar matching current mood
        if (this._mood) {
          this._currentEmotionAvatar = this.selectEmotionAvatar(this._mood.currentMood,);
        }
      }
    } catch (error) {
      log.error("Failed to load emotion avatars", error instanceof Error ? error : undefined, {},);
    } finally {
      this._emotionAvatarsLoading = false;
    }
  },

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
      const [activeRes, defsRes] = await Promise.all([
        apiFetch(`/api/actors/${actorId}/emotions`,),
        apiFetch(`/api/emotions`,),
      ],);
      if (!activeRes.ok || !defsRes.ok) { return; }

      const active = await activeRes.json();
      const defs = await defsRes.json();

      const defMap = new Map<string, { id: string; icon: string | null; display_name: string }>();
      const defList = Array.isArray(defs,) ? defs : defs?.data ?? [];
      for (const d of defList) {
        defMap.set(d.id, { id: d.id, icon: d.icon ?? null, display_name: d.display_name, },);
      }

      const activeList = Array.isArray(active,) ? active : active?.data ?? [];
      this._activeEmotions = activeList
        .map((e: { emotion_id: string; intensity: number },) => {
          const def = defMap.get(e.emotion_id,);
          if (!def) { return null; }
          return { def, intensity: e.intensity ?? 0.5, };
        },)
        .filter(Boolean,) as { def: { id: string; icon: string | null; display_name: string }; intensity: number }[];
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

  /**
   * Select the best emotion avatar for the given emotion.
   * Returns the asset ID or null if no matching avatar found.
   */
  selectEmotionAvatar(emotion: string,): string | null {
    if (this._emotionAvatars.length === 0) { return null; }

    // Exact match first
    const exact = this._emotionAvatars.find((a,) => a.emotion === emotion);
    if (exact) {
      this._currentEmotionAvatar = exact.assetId;
      return exact.assetId;
    }

    // Fallback to neutral
    const neutral = this._emotionAvatars.find((a,) => a.emotion === "neutral");
    if (neutral) {
      this._currentEmotionAvatar = neutral.assetId;
      return neutral.assetId;
    }

    // Fallback to first available
    const first = this._emotionAvatars[0];
    if (first) {
      this._currentEmotionAvatar = first.assetId;
      return first.assetId;
    }

    return null;
  },

  async updateMoodHappiness(happiness: number,) {
    if (!this._mood || !this.activeChat) { return; }
    try {
      // Get the character (NPC) in this chat
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      await apiFetch(`/api/actors/${npc.actor_id}/mood`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          happiness,
          worldId: undefined,
        },),
      },);

      if (this._mood) {
        this._mood.happiness = happiness;
        this._mood.currentMood = this._happinessToMood(happiness,);
      }
    } catch (error) {
      log.error("Failed to update mood happiness", error instanceof Error ? error : undefined, {},);
    }
  },

  async applyMoodDelta(delta: number,) {
    if (!this._mood || !this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      const moodRes = await apiFetch(`/api/actors/${npc.actor_id}/mood/delta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          delta,
          worldId: undefined,
        },),
      },);

      if (moodRes.ok) {
        const mood = await moodRes.json();
        if (this._mood) {
          this._mood.happiness = mood.happiness;
          this._mood.currentMood = mood.current_mood;
          this._moodSliderValue = mood.happiness;
        }
      }
    } catch (error) {
      log.error("Failed to apply mood delta", error instanceof Error ? error : undefined, {},);
    }
  },

  _happinessToMood(happiness: number,): string {
    if (happiness >= 80) { return "ecstatic"; }
    if (happiness >= 60) { return "happy"; }
    if (happiness >= 45) { return "neutral"; }
    if (happiness >= 25) { return "sad"; }
    return "miserable";
  },

  _getMoodEmoji(mood: string,): string {
    const emojis: Record<string, string> = {
      ecstatic: "😆",
      happy: "😊",
      neutral: "😐",
      sad: "😢",
      miserable: "😣",
      angry: "😠",
      anxious: "😰",
      calm: "😌",
      excited: "🤗",
      confused: "😕",
      proud: "😎",
      loving: "😍",
      bored: "😴",
    };
    return emojis[mood] ?? "😐";
  },

  _getMoodColor(happiness: number,): string {
    if (happiness >= 80) { return "#22c55e"; } // green
    if (happiness >= 60) { return "#84cc16"; } // lime
    if (happiness >= 45) { return "#eab308"; } // yellow
    if (happiness >= 25) { return "#f97316"; } // orange
    return "#ef4444"; // red
  },
};
