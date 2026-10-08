// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assistant personality composer (epic-character-multi-personality).
 *
 * Reads the active {@link AssistantPersonalityState} and emits the prompt
 * block for the chosen voice:
 *   - `preset`         → the preset's `promptBlocks`
 *   - `character`      → the character card, rendered as a GM persona block
 *   - `server-default` → nothing (no extra block; back-compat)
 *
 * The block is XML-delimited (prompt-injection safety) and, when the aux drift
 * score exceeds 0.5 with advisories enabled, carries a drift advisory.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils/safe-json";
import { wrapSection, } from "../xml-utils";
import { findPersonalityPreset, isPersonalityPresetKey, } from "./presets";
import type {
  AssistantPersonalityBinding,
  AssistantPersonalitySource,
  AssistantPersonalityState,
  PersonalityPreset,
} from "./types";

/** Drift score above which the composer emits an advisory. */
export const DRIFT_ADVISORY_THRESHOLD = 0.5;

/** Where the binding lives inside the chat's `gm_config` JSON blob. */
export const PERSONALITY_CONFIG_KEY = "assistantPersonality";

/**
 * Validate a raw persisted binding into a discriminated source.
 * @param raw - Raw `gm_config.assistantPersonality` value
 * @returns The parsed binding, or null when absent/malformed.
 */
export function parsePersonalityBinding(raw: unknown,): AssistantPersonalityBinding | null {
  if (raw === null || typeof raw !== "object") { return null; }
  const source = (raw as { source?: unknown }).source;
  const parsed = parsePersonalitySource(source,);
  if (!parsed) { return null; }
  const binding = raw as { lockedAt?: unknown; advisoryEnabled?: unknown };
  return {
    source: parsed,
    lockedAt: typeof binding.lockedAt === "number" ? binding.lockedAt : null,
    advisoryEnabled: binding.advisoryEnabled !== false,
  };
}

/**
 * Validate a raw source object into the discriminated union.
 * @param raw - Candidate source value
 * @returns The parsed source, or null when the shape is unknown.
 */
export function parsePersonalitySource(raw: unknown,): AssistantPersonalitySource | null {
  if (raw === null || typeof raw !== "object") { return null; }
  const { kind, presetKey, actorId, } = raw as {
    kind?: unknown;
    presetKey?: unknown;
    actorId?: unknown;
  };

  if (kind === "server-default") { return { kind: "server-default", }; }
  if (kind === "preset" && typeof presetKey === "string" && isPersonalityPresetKey(presetKey,)) {
    return { kind: "preset", presetKey, };
  }

  if (kind === "character" && typeof actorId === "string" && actorId !== "") {
    return { kind: "character", actorId, };
  }

  return null;
}

/**
 * Resolve the chat's active personality state from its `gm_config` blob.
 *
 * Absent/malformed bindings resolve to `server-default` so existing chats
 * keep today's prompt. `driftScore` is aux-owned and defaults to 0 (no
 * advisory) when the caller has no aux reading.
 * @param chatId - Owning chat
 * @param gmConfig - Raw `chats.gm_config` JSON (nullable)
 * @param driftScore - Aux drift score 0..1 (default 0)
 * @returns The resolved assistant personality state.
 */
export function resolvePersonalityState(
  chatId: string,
  gmConfig: string | null | undefined,
  driftScore = 0,
): AssistantPersonalityState {
  const blob = jsonParseOr<Record<string, unknown>>(gmConfig ?? "", {},);
  const binding = parsePersonalityBinding(blob[PERSONALITY_CONFIG_KEY],);
  return {
    chatId,
    source: binding?.source ?? { kind: "server-default", },
    lockedAt: binding?.lockedAt ?? null,
    driftScore,
    advisoryEnabled: binding?.advisoryEnabled ?? true,
  };
}

/**
 * Emit the personality prompt block for a state.
 * @param db - Database handle (character-source lookup)
 * @param state - Active assistant personality state
 * @returns The wrapped block, or null for `server-default` / unresolvable voices.
 */
export async function composePersonalityBlock(
  db: Kysely<DB>,
  state: AssistantPersonalityState,
): Promise<string | null> {
  const body = await resolveVoiceBody(db, state,);
  if (!body) { return null; }
  const advisory = driftAdvisory(state,);
  return wrapSection("assistant_personality", advisory ? `${body}\n${advisory}` : body,);
}

/**
 * Render the voice body for a state's source.
 * @param db - Database handle
 * @param state - Active assistant personality state
 * @returns The voice text, or null when nothing should be emitted.
 */
async function resolveVoiceBody(
  db: Kysely<DB>,
  state: AssistantPersonalityState,
): Promise<string | null> {
  const source = state.source;
  switch (source.kind) {
    case "server-default": {
      return null;
    }

    case "preset": {
      const preset = findPersonalityPreset(source.presetKey,);
      return preset ? renderPreset(preset,) : null;
    }

    case "character": {
      return renderCharacter(db, source.actorId,);
    }
  }
}

/**
 * Render a preset's prompt blocks plus its voice dials.
 * @param preset - Canonical preset
 * @returns The preset voice block text.
 */
function renderPreset(preset: PersonalityPreset,): string {
  const voice = preset.voice;
  return [
    `Adopt the "${preset.displayName}" assistant personality.`,
    ...preset.promptBlocks,
    `Formality ${voice.formalityLevel}/4, humor ${voice.humorLevel}/4, emotional range ${voice.emotionBandwidth}/100.`,
    `Default mood: ${preset.defaultMood}.`,
  ].join("\n",);
}

/**
 * Render an existing character card as the assistant voice.
 * @param db - Database handle
 * @param actorId - Character actor id
 * @returns The persona block, or null when the actor is missing or empty.
 */
async function renderCharacter(db: Kysely<DB>, actorId: string,): Promise<string | null> {
  const actor = await db
    .selectFrom("actors",)
    .select(["display_name", "description", "personality", "scenario",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor) { return null; }
  const parts: string[] = ["Speak as this character, in their own voice.",];
  if (actor.display_name) { parts.push(`Name: ${actor.display_name}`,); }
  if (actor.description) { parts.push(`Description: ${actor.description}`,); }
  if (actor.personality) { parts.push(`Personality: ${actor.personality}`,); }
  if (actor.scenario) { parts.push(`Scenario: ${actor.scenario}`,); }
  return parts.length > 1 ? parts.join("\n",) : null;
}

/**
 * Build the drift advisory line when the aux score crosses the threshold.
 * @param state - Active assistant personality state
 * @returns The advisory line, or null when advisories are off / drift is low.
 */
function driftAdvisory(state: AssistantPersonalityState,): string | null {
  if (!state.advisoryEnabled) { return null; }
  if (state.driftScore <= DRIFT_ADVISORY_THRESHOLD) { return null; }
  return `Drift advisory: recent replies diverged from this voice (score ${state.driftScore.toFixed(2,)}). ` +
    "Return to the personality above.";
}
