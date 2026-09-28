// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Types for the autonomy pacing panel. Split from autonomy-panel.ts so
// that module stays under the file-size gate while keeping the panel's
// shape in one obvious place.

/** One layer's editable fields. Absent key = inherit from below. */
export interface AutonomyOverride {
  preset?: string;
  enabled?: boolean;
  tickIntervalMs?: number;
  jitterRatio?: number;
  perAgentCap?: number | null;
  perUserCap?: number | null;
}

/** What the GET returns for a world scope. */
export interface AutonomyPayload {
  layers: { world: AutonomyOverride; chat: AutonomyOverride; actor: AutonomyOverride };
  resolved: Required<Omit<AutonomyOverride, "perAgentCap" | "perUserCap">> & {
    perAgentCap: number | null;
    perUserCap: number | null;
  };
  presets: Record<string, { tickIntervalMs: number; jitterRatio: number; perAgentCap: number | null }>;
  /** The world's characters, for the per-actor override picker. */
  actors: { id: string; name: string }[];
  simulation: { paused: number; tick_count: number; next_tick_at: string };
  budget: { cap: number | null; remaining: number | null; count: number; resetAt: number } | null;
}

/** Which layer this mount edits. */
export type AutonomyLayer = "world" | "chat";

/** Alpine state for the panel. */
export interface AutonomyPanelState {
  _autoWorldId: string;
  _autoChatId: string;
  _autoLayer: AutonomyLayer;
  _autoScopeId: string;
  /** Set only when the host has a character in context. Read by the
   *  per-actor section's x-if; a bare `actorId` would throw on mounts
   *  that have no actor scope, since Alpine evaluates x-show eagerly. */
  _autoActorId: string;
  autoData: AutonomyPayload | null;
  autoDraft: AutonomyOverride;
  /** Separate draft for the per-actor layer; two editors, one draft each. */
  autoActorDraft: AutonomyOverride;
  autoLoading: boolean;
  autoSaving: boolean;
  autoError: string;
  init(): Promise<void>;
  load(): Promise<void>;
  save(): Promise<void>;
  /** Write the per-actor layer to the character's internal traits. */
  saveActor(): Promise<void>;
  /** Switch the per-actor editor to another character and reread. */
  selectActor(): Promise<void>;
  /** True when the per-actor draft differs from what the actor stores. */
  actorDirty(): boolean;
  control(action: "pause" | "resume" | "step",): Promise<void>;
  /** True when the draft differs from what the layer has stored. */
  autoDirty(): boolean;
  /** The layer's own value for a field, or undefined when inherited. */
  ownValue(field: keyof AutonomyOverride,): string;
  /** The effective value, for the "(inherited: X)" hint. */
  inheritedValue(field: keyof AutonomyOverride,): string;
  /** Preset names from the server, so the picker never drifts from it. */
  presetNames(): string[];
}
