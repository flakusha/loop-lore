// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builtin video profile construction (FEAT-065-VID).
 *
 * One profile per model family (Wan, LTX, SVD, AnimateDiff, Mochi,
 * HunyuanVideo). Templates are derived from a per-family spec table so
 * families stay in sync; the resolution layer lives in
 * `video-prompt-templates.ts`.
 */
import type {
  VideoGenMode,
  VideoModelFamily,
  VideoModelProfile,
  VideoProfileRegistry,
  VideoPromptFormat,
} from "./video-prompt-templates";

/**
 * Per-mode template bodies for one prompt format.
 * @param format
 */
function formatBodies(format: VideoPromptFormat,): Record<VideoGenMode, string> {
  if (format === "keyframe-tags") {
    return {
      text2video: "[0s: {{subject}} in frame] [2s: {{motion}}]",
      image2video: "[0s: source frame of {{subject}}] [2s: {{motion}}]",
      scene: "[0s: {{sceneSummary}} — {{charName}}] [2s: {{motion}}]",
      last: "[0s: {{lastMessage}}] [2s: {{motion}}]",
    };
  }

  if (format === "json") {
    const fields =
      '{"subject": "{{subject}}", "motion": "{{motion}}", "camera": "{{cameraMovement}}", "style": "{{style}}", "duration": "{{duration}}", "aspect_ratio": "{{aspectRatio}}"}';

    const body = `Output JSON: ${fields}`;
    return { text2video: body, image2video: body, scene: body, last: body, };
  }

  return {
    text2video: "Subject: {{subject}}. Motion: {{motion}}.",
    image2video: "Animate the source frame of {{subject}}. Motion: {{motion}}.",
    scene: "Scene: {{sceneSummary}}. Subject: {{charName}}. Motion: {{motion}}.",
    last: "Illustrate the message: {{lastMessage}}. Motion: {{motion}}.",
  };
}

/**
 * Layer per-mode bodies + family style into the three detail levels.
 * @param format
 * @param style
 */
function videoTemplates(
  format: VideoPromptFormat,
  style: string,
): Record<VideoGenMode, Record<"instant" | "balanced" | "detailed", string>> {
  const bodies = formatBodies(format,);
  // The JSON body is self-contained: duration / aspect_ratio / style / camera
  // already ride as fields inside the object, so the prose suffix below would
  // land after the closing brace and contradict the "output only a JSON
  // object" instruction. Detail level is therefore inert for this format.
  if (format === "json") {
    const levels = { instant: bodies.text2video, balanced: bodies.text2video, detailed: bodies.text2video, };
    return { text2video: levels, image2video: levels, scene: levels, last: levels, };
  }

  const wrap = (body: string,) => ({
    instant: `${body} {{duration}} {{aspectRatio}}.`,
    balanced: `${body} Style: {{style}} (${style}). {{duration}}, {{aspectRatio}}.`,
    detailed: `${body} Style: {{style}} (${style}). Camera: {{cameraMovement}}.` +
      ` {{duration}}, {{aspectRatio}}. Avoid: {{negativePrompt}}.`,
  });

  return {
    text2video: wrap(bodies.text2video,),
    image2video: wrap(bodies.image2video,),
    scene: wrap(bodies.scene,),
    last: wrap(bodies.last,),
  };
}

/** Per-family spec table; profiles derive from it so families stay in sync. */
const FAMILY_SPECS: Record<
  VideoModelFamily,
  { name: string; format: VideoPromptFormat; style: string; duration: number; ratio: string }
> = {
  wan: { name: "Wan 2.1/2.2", format: "natural", style: "cinematic, volumetric lighting", duration: 4, ratio: "16:9", },
  ltx: { name: "LTX-2.3", format: "natural", style: "photoreal, natural motion", duration: 5, ratio: "16:9", },
  svd: {
    name: "Stable Video Diffusion",
    format: "natural",
    style: "high-fidelity frame interpolation",
    duration: 4,
    ratio: "16:9",
  },
  animatediff: {
    name: "AnimateDiff",
    format: "keyframe-tags",
    style: "anime, expressive motion",
    duration: 3,
    ratio: "16:9",
  },
  mochi: { name: "Mochi", format: "natural", style: "descriptive natural language", duration: 5, ratio: "16:9", },
  hunyuan: { name: "HunyuanVideo", format: "json", style: "cinematic realism", duration: 5, ratio: "16:9", },
};

/** Built-in read-only video profiles, keyed by profile id. */
export const BUILTIN_VIDEO_PROFILES: Record<string, VideoModelProfile> = Object.fromEntries(
  Object.entries(FAMILY_SPECS,).map(([id, spec,],) => [
    id,
    {
      id,
      name: spec.name,
      families: [id as VideoModelFamily,],
      promptFormat: spec.format,
      maxTokenHint: 600,
      defaults: { durationSeconds: spec.duration, aspectRatio: spec.ratio, },
      templates: videoTemplates(spec.format, spec.style,),
    } satisfies VideoModelProfile,
  ]),
);

/** Default video registry: model-name matching (first match wins) + wan default. */
export const DEFAULT_VIDEO_PROFILE_REGISTRY: VideoProfileRegistry = {
  profiles: BUILTIN_VIDEO_PROFILES,
  defaultProfileId: "wan",
  modelMatching: Object.keys(FAMILY_SPECS,).map((id,) => ({ pattern: id, profileId: id, })),
};
