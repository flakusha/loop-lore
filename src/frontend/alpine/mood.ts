import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { t, } from "./i18n";
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
  _activeChatWorldId: null as string | null,
  _emotionAvatars: [] as { emotion: string; avatarId: string; assetId: string }[],
  _emotionAvatarsLoading: false,
  _currentEmotionAvatar: null as string | null,
  _emotionGenRunning: false,
  _emotionGenStatus: null as string | null,
  _emotionGenJobId: null as string | null,

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

      // Resolve the chat's world so mood is read from the world-scoped record
      // (falls back to the global mood when the chat has no world).
      this._activeChatWorldId = null;
      try {
        const chatRes = await apiFetch(`/api/chats/${this.activeChat}`,);
        if (chatRes.ok) {
          const activeChat = await chatRes.json();
          this._activeChatWorldId = activeChat.world_id ?? null;
        }
      } catch { /* keep null */ }

      const worldQuery = this._activeChatWorldId ? `?worldId=${this._activeChatWorldId}` : "";
      const moodRes = await apiFetch(`/api/actors/${npc.actor_id}/mood${worldQuery}`,);
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

  async generateEmotionAvatars() {
    if (!this.activeChat || this._emotionGenRunning) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = await res.json();
      const npc = Array.isArray(participants,)
        ? participants.find((p: any,) => p.role_in_chat === "member" && p.actor_type !== "user")
        : null;
      if (!npc?.actor_id) { return; }

      const baseAvatarId = this.currentCharacter?.avatar_asset_id ?? null;
      if (!baseAvatarId) {
        this._emotionGenStatus = t("status.noBaseAvatar",);
        return;
      }

      this._emotionGenRunning = true;
      this._emotionGenStatus = t("status.startingGeneration",);
      try {
        const genRes = await apiFetch(`/api/actors/${npc.actor_id}/emotion-avatars`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ baseAvatarId, },),
        },);
        const genBody = await genRes.json().catch(() => ({}));
        if (!genRes.ok) {
          this._emotionGenStatus = genBody.message ?? t("status.generationFailedToStart",);
          return;
        }
        this._emotionGenJobId = genBody.jobId ?? null;
        this._emotionGenStatus = t("status.generatingEmotionAvatars",);
        await this._pollEmotionJob(npc.actor_id, this._emotionGenJobId,);
      } finally {
        this._emotionGenRunning = false;
      }
    } catch (error) {
      log.error("Failed to start emotion avatar generation", error instanceof Error ? error : undefined, {},);
      this._emotionGenStatus = t("status.failedToStartGeneration",);
      this._emotionGenRunning = false;
    }
  },

  async _pollEmotionJob(actorId: string, jobId: string | null,) {
    if (!jobId) {
      this._emotionGenStatus = t("status.generationNoJobId",);
      return;
    }
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve,) => setTimeout(resolve, 2000,));
      try {
        const res = await apiFetch(`/api/actors/${actorId}/emotion-avatars/jobs/${jobId}`,);
        if (!res.ok) { continue; }
        const job = await res.json();
        const status = job.status as string;
        if (status === "completed") {
          this._emotionGenStatus = t("status.emotionAvatarsGenerated",);
          await this.loadEmotionAvatars();
          return;
        }
        if (status === "failed" || status === "cancelled") {
          this._emotionGenStatus = t("status.generationOutcome", { status, },);
          return;
        }
      } catch { /* keep polling */ }
    }
    this._emotionGenStatus = t("status.generationTimedOut",);
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
      const [activeRes, defsRes,] = await Promise.all([
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
   * Resolve the avatar asset for a single assistant message based on its
   * detected emotion. Emotion avatars are bound per message (and per chat's
   * current character), not globally. Falls back to the character's base
   * avatar when the message has no emotion or no matching variant exists.
   * @param msg - The message being rendered
   * @returns Asset id to display, or null to hide the avatar
   */
  avatarForMessage(msg: { role?: string; emotion?: string | null },): string | null {
    if (msg.role === "user") { return null; }
    if (msg.emotion) {
      // Pure per-message lookup (does NOT mutate the mood-driven global
      // _currentEmotionAvatar, which stays for non-message avatar areas).
      const exact = this._emotionAvatars.find((a,) => a.emotion === msg.emotion);
      if (exact) { return exact.assetId; }
      const neutral = this._emotionAvatars.find((a,) => a.emotion === "neutral");
      if (neutral) { return neutral.assetId; }
      if (this._emotionAvatars[0]) { return this._emotionAvatars[0].assetId; }
    }
    return this.currentCharacter?.avatar_asset_id ?? null;
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
        body: jsonBody({
          happiness,
          worldId: this._activeChatWorldId ?? undefined,
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
        body: jsonBody({
          delta,
          worldId: this._activeChatWorldId ?? undefined,
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
