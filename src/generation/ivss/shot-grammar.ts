// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IVSS shot grammar — pure scene/shot -> workflow variable compiler.
 *
 * The output mirrors the shipped Director fixture's widget strings:
 * `builder_state` carries `[Shot N]` blocks with absolute timestamps plus
 * soundscape/music, and `timeline_data` carries the shot items. Nothing here
 * touches a DB, a ComfyUI server or a node pack; the run pipeline feeds these
 * primitives through the existing `{{var}}` substitution path.
 */
import { estimateTokens, } from "../../chat/token-utils";
import { safeJsonStringify, } from "../../utils";

/** Default prompt budget, in estimated tokens. */
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_FPS = 24;

/** Sections dropped on budget pressure, lowest priority first. */
const DROP_ORDER = ["style", "music", "soundscape",] as const;

/** A shot row as persisted by `scenario_shots`. */
export interface ShotGrammarShot {
  id: string;
  sort_order: number;
  start_ms: number;
  end_ms: number;
  description: string;
  camera_json?: string | null;
  narration?: string | null;
}

/** Scene-level fields the grammar needs. */
export interface ShotGrammarScene {
  id: string;
  mode?: string | null;
  fps?: number | null;
  seed?: string | null;
}

/** Inputs to {@link compileShotGrammar}. Sections are optional. */
export interface ShotGrammarInput {
  scene: ShotGrammarScene;
  shots: readonly ShotGrammarShot[];
  soundscape?: string | null;
  music?: string | null;
  style?: string | null;
}

/** Options for {@link compileShotGrammar}. */
export interface ShotGrammarOptions {
  maxTokens?: number;
}

/** Primitive values accepted by the workflow substitutor. */
export interface ShotGrammarVariables {
  prompt: string;
  timeline_data: string;
  builder_state: string;
  duration_frames: number;
  seed: string;
}

/** Compiled prompt plus its workflow variable map. */
export interface ShotGrammarResult {
  prompt: string;
  variables: ShotGrammarVariables;
  /** Sections dropped by budget pressure, in the order they were dropped. */
  truncated: string[];
}

/**
 * Format a millisecond offset as the fixture's absolute `mm:ss.mmm` stamp.
 * @param ms - Offset from scene start
 * @returns Zero-padded timestamp
 */
export function formatShotTimestamp(ms: number,): string {
  const safe = Number.isFinite(ms,) && ms > 0 ? Math.floor(ms,) : 0;
  const minutes = Math.floor(safe / 60_000,);
  const seconds = Math.floor((safe % 60_000) / 1_000,);
  return `${String(minutes,).padStart(2, "0",)}:${String(seconds,).padStart(2, "0",)}.${
    String(safe % 1_000,).padStart(3, "0",)
  }`;
}

/**
 * Compile a scene into a byte-stable prompt and workflow variables.
 * @param input - Scene, shots and optional audio/style sections
 * @param options - Budget override
 * @throws {Error} When the scene has no shots or a shot ends before it starts
 * @returns The prompt, variable map and dropped-section report
 */
export function compileShotGrammar(
  input: ShotGrammarInput,
  options: ShotGrammarOptions = {},
): ShotGrammarResult {
  if (input.shots.length === 0) {
    throw new Error("IVSS scene has no shots to compile",);
  }

  const shots = [...input.shots,].sort((a, b,) =>
    a.sort_order - b.sort_order || a.start_ms - b.start_ms || a.id.localeCompare(b.id,)
  );

  for (const shot of shots) {
    if (shot.end_ms < shot.start_ms) {
      throw new Error(`shot ${shot.id} ends before it starts`,);
    }
  }

  const sections: Record<"style" | "music" | "soundscape", string | undefined> = {
    style: input.style?.trim() ? `style_bible:\n${input.style.trim()}` : undefined,
    music: input.music?.trim() ? `non_diegetic_music:\n${input.music.trim()}` : undefined,
    soundscape: input.soundscape?.trim()
      ? `overall_soundscape:\n${input.soundscape.trim()}`
      : undefined,
  };

  let shotLines = shots.map((shot, index,) => {
    const lines = [`[Shot ${index + 1}] At ${formatShotTimestamp(shot.start_ms,)} — ${shot.description.trim()}`,];
    if (shot.narration?.trim()) { lines.push(`Narration: ${shot.narration.trim()}`,); }
    if (shot.camera_json?.trim()) { lines.push(`Camera: ${shot.camera_json.trim()}`,); }
    return lines.join("\n",);
  },);

  const assemble = (): string =>
    [sections.style, shotLines.join("\n\n",), sections.soundscape, sections.music,]
      .filter((part,): part is string => Boolean(part,))
      .join("\n\n",);

  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const truncated: string[] = [];
  while (estimateTokens(assemble(),) > maxTokens) {
    const next = DROP_ORDER.find((key,) => Boolean(sections[key],));
    if (next) {
      sections[next] = undefined;
      truncated.push(next,);
      continue;
    }

    if (shotLines.length === 1) { break; }
    truncated.push(`shots:${shotLines.length}`,);
    shotLines = shotLines.slice(0, -1,);
  }

  if (estimateTokens(assemble(),) > maxTokens) { truncated.push("prompt-over-budget",); }

  const prompt = assemble();
  const firstMs = Math.min(...shots.map((shot,) => shot.start_ms),);
  const lastMs = Math.max(...shots.map((shot,) => shot.end_ms),);
  const fps = input.scene.fps && input.scene.fps > 0 ? input.scene.fps : DEFAULT_FPS;
  const durationFrames = Math.ceil(((lastMs - firstMs) / 1000) * fps,);
  const durationSecs = Number(((lastMs - firstMs) / 1000).toFixed(3,),);

  const builderState = {
    version: 1,
    mode: input.scene.mode ?? "t2v",
    duration: durationSecs,
    ref: {
      detailed_description: prompt,
      style_line: sections.style ?? "",
      soundscape: sections.soundscape ?? "",
      music: sections.music ?? "",
    },
    soundscape: sections.soundscape ?? "",
    music: sections.music ?? "",
  };

  const timelineData = {
    version: 1,
    items: shots.map((shot, index,) => ({
      id: shot.id,
      enabled: true,
      order: index,
      slot: 0,
      start: Number((shot.start_ms / 1000).toFixed(3,),),
      duration: Number(((shot.end_ms - shot.start_ms) / 1000).toFixed(3,),),
      type: "shot",
      value: shot.description.trim(),
    })),
    prompt_blocks: [{ type: "detailed_description", text: prompt, },],
    builder_state: builderState,
  };

  const timelineResult = safeJsonStringify(timelineData,);
  const builderResult = safeJsonStringify(builderState,);
  if (!timelineResult.ok || !builderResult.ok) {
    throw new Error("IVSS workflow variables could not be serialized",);
  }

  return {
    prompt,
    variables: {
      prompt,
      timeline_data: timelineResult.value,
      builder_state: builderResult.value,
      duration_frames: durationFrames,
      seed: input.scene.seed ?? "",
    },
    truncated,
  };
}
