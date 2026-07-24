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
    } catch (error) {
      log.error("Failed to load mood", error instanceof Error ? error : undefined, {},);
    } finally {
      this._moodLoading = false;
    }
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
