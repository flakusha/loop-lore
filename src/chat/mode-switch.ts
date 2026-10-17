// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/chat/mode-switch.ts — InteractionMode routing table.
 *
 * `InteractionMode` is deliberately NOT `ChatMode`: the DB enum (`chats.mode`)
 * describes how a chat is TYPED (direct/group/story/battle), while this type
 * describes what the user is DOING right now — asking a question, checking
 * inventory, entering a battle. One chat can be in several interaction modes
 * over its life, and each dispatches to a different orchestration target.
 *
 * This module is a PURE table plus a transition validator. It performs no I/O
 * and rewires nothing — the slice that owns the chat pipeline consumes it.
 */

/** What the user is doing in a chat, independent of the chat's type. */
export const InteractionMode = {
  /** Ordinary free-form conversation. */
  Normal: "normal",
  /** An RPG battle/encounter is resolving. */
  Battle: "battle",
  /** The user asked an out-of-band question. */
  Question: "question",
  /** The user is inspecting carried items. */
  Inventory: "inventory",
} as const;
/** */
export type InteractionMode = (typeof InteractionMode)[keyof typeof InteractionMode];

/** The orchestration target an interaction mode dispatches to. */
export const OrchestrationTarget = {
  /** The standard generation pipeline. */
  Chat: "chat",
  /** The RPG combat resolver. */
  Combat: "combat",
  /** The question/answer pipeline (rpg_questions, 050). */
  Question: "question",
  /** The inventory inspection pipeline (actor_items). */
  Inventory: "inventory",
} as const;
/** */
export type OrchestrationTarget = (typeof OrchestrationTarget)[keyof typeof OrchestrationTarget];

/** Raised when a caller requests a mode change the table does not allow. */
export class ModeTransitionError extends Error {
  override readonly name = "ModeTransitionError";

  /**
   * @param from the mode being left
   * @param to the mode requested
   */
  constructor(public readonly from: InteractionMode, public readonly to: InteractionMode,) {
    super(`Illegal interaction-mode transition: ${from} -> ${to}`,);
  }
}

/**
 * Ambient facts the routing table consults. Kept as an interface so the
 * caller can grow it without changing every call signature.
 */
export interface InteractionContext {
  /** Whether an active RPG encounter is running. */
  inCombat?: boolean;
  /** Whether the world has the RPG combat system enabled. */
  combatEnabled?: boolean;
  /** Whether the current chat is visible-novel rendered (chat-mode default). */
  visualNovel?: boolean;
}

/** Every interaction mode, in declaration order. */
export const INTERACTION_MODES = Object.values(InteractionMode,) as InteractionMode[];

/** Which target each mode dispatches to. Pure table, no branching on context. */
const MODE_TARGETS: Record<InteractionMode, OrchestrationTarget> = {
  normal: OrchestrationTarget.Chat,
  battle: OrchestrationTarget.Combat,
  question: OrchestrationTarget.Question,
  inventory: OrchestrationTarget.Inventory,
};

/**
 * Resolve the orchestration target for a mode.
 * @param params.mode the interaction mode being entered
 * @param params.context ambient facts; `inCombat` false forces `normal`,
 *        because combat routing without a live encounter would dispatch to a
 *        resolver with nothing to resolve.
 * @returns the orchestration target that handles the mode
 */
export function routeInteractionMode(
  { mode, context = {}, }: { mode: InteractionMode; context?: InteractionContext },
): OrchestrationTarget {
  if (mode === InteractionMode.Battle && context.inCombat !== true) {
    return MODE_TARGETS[InteractionMode.Normal];
  }

  return MODE_TARGETS[mode];
}

/**
 * Every legal mode change. Anything not listed here throws: a chat may always
 * fall back to `normal` and drop out of a side mode, but it cannot jump
 * straight from one side mode to another, and combat cannot be entered by
 * anything but `normal`.
 */
const ALLOWED: Record<InteractionMode, InteractionMode[]> = {
  normal: [InteractionMode.Battle, InteractionMode.Question, InteractionMode.Inventory,],
  battle: [InteractionMode.Normal,],
  question: [InteractionMode.Normal,],
  inventory: [InteractionMode.Normal,],
};

/**
 * Check a mode change against the table.
 * @param params.from the mode being left
 * @param params.to the mode requested
 * @returns the mode requested, when the change is legal
 * @throws {ModeTransitionError} when the change is not in the table
 */
export function assertValidTransition(
  { from, to, }: { from: InteractionMode; to: InteractionMode },
): InteractionMode {
  if (from === to) { return to; }
  if (ALLOWED[from].includes(to,)) { return to; }
  throw new ModeTransitionError(from, to,);
}

/**
 * The modes reachable in one step from `from`, excluding `from` itself.
 * @param from the mode to enumerate from
 * @returns every legal destination
 */
export function allowedTransitions(from: InteractionMode,): InteractionMode[] {
  return [...ALLOWED[from],];
}
