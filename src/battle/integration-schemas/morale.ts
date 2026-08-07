// ── Morale State (Shared: Social, Battle) ─────────────────────

/** Morale level */
export type MoraleLevel = "broken" | "shaken" | "steady" | "confident" | "inspired";

/** Morale state for a combatant */
export interface MoraleState {
  /** Character ID */
  characterId: string;
  /** Current morale value (0-100) */
  value: number;
  /** Computed morale level */
  level: MoraleLevel;
  /** Morale modifiers active */
  modifiers: MoraleModifier[];
  /** When morale was last updated */
  lastUpdated: string;
}

/** Morale modifier */
export interface MoraleModifier {
  /** What caused this modifier */
  reason: string;
  /** Value change */
  value: number;
  /** Duration in turns (0 = permanent) */
  duration: number;
  /** When this modifier was applied */
  appliedAt: string;
}

/** Compute morale level from value */
export function computeMoraleLevel(value: number,): MoraleLevel {
  if (value <= 20) { return "broken"; }
  if (value <= 40) { return "shaken"; }
  if (value <= 60) { return "steady"; }
  if (value <= 80) { return "confident"; }
  return "inspired";
}

/** Create initial morale state */
export function createMoraleState(
  characterId: string,
  initialValue = 50,
): MoraleState {
  return {
    characterId,
    value: Math.max(0, Math.min(100, initialValue,),),
    level: computeMoraleLevel(initialValue,),
    modifiers: [],
    lastUpdated: new Date().toISOString(),
  };
}

/** Apply morale modifier */
export function applyMoraleModifier(
  state: MoraleState,
  modifier: MoraleModifier,
): MoraleState {
  const newValue = Math.max(0, Math.min(100, state.value + modifier.value,),);
  return {
    ...state,
    value: newValue,
    level: computeMoraleLevel(newValue,),
    modifiers: [...state.modifiers, modifier,],
    lastUpdated: new Date().toISOString(),
  };
}
