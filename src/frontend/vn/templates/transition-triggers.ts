/**
 * VN Transition Triggers
 *
 * Auto-trigger rules that detect context changes and
 * suggest appropriate scene templates.
 */

import type { VnTemplate, } from "./template-engine";
import { getSceneTemplate, } from "./scene-templates";

// ── Trigger Definitions ────────────────────────────────────

export interface VnTransitionTrigger {
  id: string;
  name: string;
  description: string;
  condition: (context: VnTriggerContext) => boolean;
  templateId: string;
  priority: number;
}

export interface VnTriggerContext {
  currentLocationId?: string;
  previousLocationId?: string;
  combatActive: boolean;
  charactersInScene: string[];
  previousCharacters: string[];
  emotionChange?: number;
  choiceSelected: boolean;
  sceneEnding: boolean;
}

// ── Built-in Triggers ──────────────────────────────────────

export const TRANSITION_TRIGGERS: VnTransitionTrigger[] = [
  {
    id: "on_location_change",
    name: "Location Change",
    description: "Triggers when scene location changes",
    condition: (ctx) => Boolean(ctx.currentLocationId && ctx.previousLocationId && ctx.currentLocationId !== ctx.previousLocationId),
    templateId: "introduction",
    priority: 10,
  },
  {
    id: "on_combat_start",
    name: "Combat Start",
    description: "Triggers when combat mode activates",
    condition: (ctx) => ctx.combatActive,
    templateId: "combat_start",
    priority: 20,
  },
  {
    id: "on_character_enter",
    name: "Character Enter",
    description: "Triggers when a new character appears",
    condition: (ctx) => ctx.charactersInScene.some((c) => !ctx.previousCharacters.includes(c)),
    templateId: "introduction",
    priority: 15,
  },
  {
    id: "on_emotion_shift",
    name: "Emotion Shift",
    description: "Triggers on significant emotion change",
    condition: (ctx) => Boolean(ctx.emotionChange && Math.abs(ctx.emotionChange) > 0.5),
    templateId: "confrontation",
    priority: 5,
  },
  {
    id: "on_choice_result",
    name: "Choice Result",
    description: "Triggers after branching choice selection",
    condition: (ctx) => ctx.choiceSelected,
    templateId: "resolution",
    priority: 25,
  },
  {
    id: "on_scene_end",
    name: "Scene End",
    description: "Triggers when scene is ending",
    condition: (ctx) => ctx.sceneEnding,
    templateId: "farewell",
    priority: 30,
  },
];

// ── Trigger Evaluation ─────────────────────────────────────

export function evaluateTriggers(
  context: VnTriggerContext,
): VnTemplate | null {
  const matchingTriggers = TRANSITION_TRIGGERS
    .filter((trigger) => trigger.condition(context,))
    .sort((a, b) => b.priority - a.priority,);

  if (matchingTriggers.length === 0) { return null; }

  const trigger = matchingTriggers[0];
  if (!trigger) { return null; }

  return getSceneTemplate(trigger.templateId,) ?? null;
}

// ── Trigger History (for debugging) ────────────────────────

export interface VnTriggerEvent {
  triggerId: string;
  timestamp: string;
  templateId: string;
}

const triggerHistory: VnTriggerEvent[] = [];
const MAX_HISTORY = 50;

export function recordTrigger(triggerId: string, templateId: string): void {
  triggerHistory.push({
    triggerId,
    timestamp: new Date().toISOString(),
    templateId,
  },);

  if (triggerHistory.length > MAX_HISTORY) {
    triggerHistory.shift();
  }
}

export function getTriggerHistory(): VnTriggerEvent[] {
  return [...triggerHistory];
}

export function clearTriggerHistory(): void {
  triggerHistory.length = 0;
}
