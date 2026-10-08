// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Procedural asset pipeline glue (creation-wizard → asset prompts).
 *
 * Given an entity produced by the creation pipeline (`create_item` /
 * `create_character` / `create_location` assistant tools), compose the
 * prompt strings the existing engines consume: `ImageGenOptions.prompt`
 * for the image engine (`image-engine/index.ts`) and an
 * `AudioTemplateContext`-flavoured natural body for the audio prompt
 * templates. This module does NOT generate images or audio — it only
 * produces the prompt spec.
 *
 * # ponytail: prompt-only glue; when cascade auto-gen wants full provider
 * fan-out, extend with a provider-dispatch stage.
 */
import { composeWorkflowTags, type WorkflowKind, } from "./workflow-tags";

/** Entity kinds the pipeline accepts (the wizard-creation set). */
export type AssetPipelineKind = "item" | "character" | "location";

/** */
export interface AssetPipelineRequest {
  kind: AssetPipelineKind;
  name: string;
  description: string;
  /** Freeform attributes interpolated into prompts (e.g. mood, material). */
  meta?: Record<string, string>;
}

/** */
export interface AssetPipelineResult {
  /** Image prompt, shaped for `ImageGenOptions.prompt`. */
  imagePrompt: string;
  /** Audio prompt, or `null` when no audio template covers the kind. */
  audioPrompt: string | null;
}

/** Per-kind image framing, mirroring the workflow-tag vocabulary. */
const IMAGE_SUBJECT_BY_KIND: Record<AssetPipelineKind, string> = {
  character: "Character concept art",
  item: "Item concept art",
  location: "Location concept art",
};

/** Audio sub-type per kind, keyed to the audio template sub-types
 * (tts / sfx / music / voice-clone). Locations have no per-entity audio —
 * scene music comes from playlists — so they resolve to `null`. */
const AUDIO_SUBTYPE_BY_KIND: Partial<Record<AssetPipelineKind, "tts" | "sfx">> = {
  character: "tts",
  item: "sfx",
};

/**
 * Interpolate `{{token}}` placeholders from the meta bag (same vocabulary
 * as AUDIO_TEMPLATE_VARIABLES); unknown tokens drop to empty.
 * @param s - string possibly containing `{{token}}` placeholders
 * @param meta - value bag
 */
function interpolate(s: string, meta?: Record<string, string>,): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_match, token: string,) => meta?.[token] ?? "",)
    .replace(/\s{2,}/g, " ",)
    .trim();
}

/**
 * Procedural asset pipeline. Deterministic prompt composition only —
 * no LLM, no DB, no provider calls.
 * @returns A `run` function mapping creation-wizard entities to asset prompts
 * @throws {Error} when `req.kind` is not "item", "character", or "location"
 * @throws {Error} when `req.name` is empty or whitespace
 */
export function buildAssetPipeline(): {
  run(req: AssetPipelineRequest,): AssetPipelineResult;
} {
  return {
    run(req,): AssetPipelineResult {
      const framing = IMAGE_SUBJECT_BY_KIND[req.kind as AssetPipelineKind];
      if (!framing) {
        throw new Error(
          `Unsupported asset kind: ${String(req.kind,)}; expected "item", "character", or "location"`,
        );
      }

      if (!req.name.trim()) {
        throw new Error("Asset pipeline requires a non-empty name",);
      }

      const [tag,] = composeWorkflowTags([
        { kind: req.kind as WorkflowKind, modality: "image", },
      ],);

      const metaParts = req.meta
        ? Object.entries(req.meta,).map(([k, v,],) => `${k}: ${v}`)
        : [];

      const raw = [
        `${framing}: ${req.name}`,
        req.description,
        `workflow: ${tag}`,
        ...metaParts,
      ].join(". ",);

      const imagePrompt = `${interpolate(raw, req.meta,)}.`;

      const subtype = AUDIO_SUBTYPE_BY_KIND[req.kind];
      const audioPrompt = subtype === "tts"
        ? `Voice: ${req.name}. Read aloud: ${req.description}`
        : subtype === "sfx"
        ? `Sound effect: ${req.description}. Mood: ${req.meta?.mood ?? "neutral"}.`
        : null;

      return { imagePrompt, audioPrompt, };
    },
  };
}
