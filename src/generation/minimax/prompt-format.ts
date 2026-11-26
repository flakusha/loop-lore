// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 320

/**
 * MiniMax H3 FL/REF prompt-format conversion.
 *
 * Rewrites a user's plain per-cut scenario into the exact heading/shot grammar
 * MiniMax H3 Director expects. A pure validator gates the output; one AUX call
 * plus a single re-prompt carrying the missing checks is the whole retry
 * budget, then the caller fails closed. `call` is injected so tests need no
 * global stubs.
 */
import type { Kysely, } from "kysely";
import type { callAux, } from "../../aux-pipeline/runner";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenerationMessage, } from "../gen-types-options";

export type MinimaxMode = "fl2va" | "ref2va";

const FL_HEADINGS = [
  "integrated_multimodal_description:",
  "overall_soundscape:",
  "non_diegetic_music:",
] as const;

const REF_HEADINGS = [
  "subject_definitions:",
  "summary:",
  "retention_analysis:",
  "detailed_description:",
  "overall_soundscape:",
  "non_diegetic_music:",
] as const;

const ALIGNMENT_PREFIX = "How the reference pictures align with the target video —";
const ALIGNMENT_ANCHOR = /Picture 1 \(from Shot 1\) aligns with the 0\.00-second mark of the target video/;
// Only real shot headers (marker followed by a description letter) count;
// `<Subject 1> (appears in [Shot 1], [Shot 2])` cross-references do not.
const SHOT_MARKER = /\[Shot (\d+)\]\s+([A-Za-z][\s\S]*?)(?=\[Shot \d+\]\s+[A-Za-z]|$)/g;
const CUT_TIME = /At (\d{2}):(\d{2})\.(\d{3})/;

/** Pure validation result; `missing` drives the single re-prompt. */
export interface MinimaxValidationResult {
  ok: boolean;
  missing: string[];
}

export interface MinimaxValidationOptions {
  /** Reference labels required for REF2VA when references are supplied. */
  references?: string[];
}

function headingsFor(mode: MinimaxMode,): readonly [string, ...string[],] {
  return mode === "fl2va" ? FL_HEADINGS : REF_HEADINGS;
}

/**
 * Validate a candidate MiniMax prompt without any I/O.
 * @param text - candidate prompt
 * @param mode - target Director mode
 * @param options - alignment/reference requirements from the request
 * @returns ok with empty missing, or the list of failed checks
 */
export function validateMinimaxPrompt(
  text: string,
  mode: MinimaxMode,
  options: MinimaxValidationOptions = {},
): MinimaxValidationResult {
  const missing: string[] = [];
  const body = text.trim();
  if (!body) {
    missing.push("non_empty",);
    return { ok: false, missing, };
  }

  if (body.includes("```",)) { missing.push("no_code_fences",); }
  if (/\{\{[^}]*\}\}/.test(body,)) { missing.push("no_placeholders",); }

  const lines = body.split(/\r?\n/,);
  const first = lines[0]?.trim() ?? "";
  let cursor = 0;
  if (first.startsWith(ALIGNMENT_PREFIX,)) {
    if (!ALIGNMENT_ANCHOR.test(first,)) { missing.push("alignment_line",); }
    cursor = 1;
    while (cursor < lines.length && lines[cursor]?.trim() === "") { cursor++; }
  } else if (mode === "fl2va") {
    missing.push("alignment_line",);
  }

  const headings = headingsFor(mode,);
  let from = 0;
  for (const heading of headings) {
    const index = body.indexOf(heading, from,);
    if (index < 0) { missing.push(heading,); }
    else { from = index + heading.length; }
  }

  const firstContent = lines[cursor]?.trim() ?? "";
  if (!firstContent.startsWith(headings[0],)) { missing.push("wrapper_text",); }

  const shots = [...body.matchAll(SHOT_MARKER,),];
  if (shots.length === 0) { missing.push("shot_1",); }
  let previousMs = -1;
  for (const [index, marker,] of shots.entries()) {
    if (Number(marker[1],) !== index + 1) {
      missing.push("shot_numbering",);
      break;
    }

    const rest = marker[2] ?? "";
    if (index === 0) {
      if (CUT_TIME.test(rest,)) { missing.push("shot_1_timestamp",); }
      continue;
    }

    const cut = CUT_TIME.exec(rest,);
    if (!cut) {
      missing.push("shot_timestamp",);
      continue;
    }

    const ms = (Number(cut[1],) * 60 + Number(cut[2],)) * 1_000 + Number(cut[3],);
    if (ms <= previousMs) { missing.push("shot_order",); }
    previousMs = ms;
  }

  if (mode === "ref2va" && options.references?.length) {
    if (!/<(?:Subject|Picture|Video|Audio) \d+>/.test(body,)) { missing.push("reference_labels",); }
  }

  return { ok: missing.length === 0, missing, };
}

/** Map a resolved workflow id to its MiniMax mode, or null for other workflows. */
export function minimaxModeForWorkflow(workflow: string | undefined,): MinimaxMode | null {
  if (!workflow) { return null; }
  if (
    workflow.startsWith("minimax-h3-video-ref2va",) ||
    workflow.startsWith("minimax-h3-ref2va-fragment",)
  ) { return "ref2va"; }

  if (
    workflow.startsWith("minimax-h3-video-fl2va",) ||
    // Legacy `video-` aliases kept for existing callers; bare ids are shipped files.
    workflow.startsWith("minimax-h3-video-i2v-fragment",) ||
    workflow.startsWith("minimax-h3-video-t2v-fragment",) ||
    workflow.startsWith("minimax-h3-i2v-fragment",) ||
    workflow.startsWith("minimax-h3-t2v-fragment",)
  ) { return "fl2va"; }

  return null;
}

/** One shot's text for the shared H3 grammar. */
export interface MinimaxGrammarShot {
  description: string;
  /** Offset from scene start, in ms; used for cuts after shot 1. */
  startMs: number;
  narration?: string;
  camera?: string;
}

/** Structured input to the shared, pure H3 grammar assembler. */
export interface MinimaxGrammarInput {
  mode: MinimaxMode;
  shots: readonly MinimaxGrammarShot[];
  style?: string | null;
  soundscape?: string | null;
  music?: string | null;
  references?: string[];
  durationSeconds?: number;
}

export type MinimaxGrammarResult =
  | { ok: true; prompt: string }
  | { ok: false; missing: string[] };

/** @param ms - scene offset in ms @returns mm:ss.mmm cut stamp */
function grammarCut(ms: number,): string {
  const safe = Number.isFinite(ms,) && ms > 0 ? Math.floor(ms,) : 0;
  const minutes = Math.floor(safe / 60_000,);
  const seconds = Math.floor((safe % 60_000) / 1_000,);
  return `${String(minutes,).padStart(2, "0",)}:${String(seconds,).padStart(2, "0",)}.${
    String(safe % 1_000,).padStart(3, "0",)
  }`;
}

/**
 * Assemble the one FL/REF grammar shared by the video route and IVSS
 * fragments, validated by the same pure validator as AUX output.
 * @param input - mode, shots, optional sections and endpoint duration
 * @returns the valid prompt, or the failed checks for a caller to repair
 */
export function assembleMinimaxPrompt(input: MinimaxGrammarInput,): MinimaxGrammarResult {
  const shotLines = input.shots.map((shot, index,) => {
    const head = index === 0
      ? `[Shot 1] ${shot.description.trim()}`
      : `[Shot ${index + 1}] At ${grammarCut(shot.startMs,)} — ${shot.description.trim()}`;

    const lines = [head,];
    if (shot.narration?.trim()) { lines.push(`Narration: ${shot.narration.trim()}`,); }
    if (shot.camera?.trim()) { lines.push(`Camera: ${shot.camera.trim()}`,); }
    return lines.join("\n",);
  },);

  const soundscape = input.soundscape?.trim() || "N/A";
  const music = input.music?.trim() || "N/A";

  let prompt: string;
  if (input.mode === "fl2va") {
    const alignment =
      `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; ` +
      `Picture 2 (from Shot ${input.shots.length}) aligns with the ${
        (input.durationSeconds ?? 0).toFixed(2,)
      }-second mark of the target video.`;

    const style = input.style?.trim();
    prompt = [
      alignment,
      "",
      `integrated_multimodal_description:\n${style ? `${style}\n\n` : ""}${shotLines.join("\n\n",)}`,
      `overall_soundscape:\n${soundscape}`,
      `non_diegetic_music:\n${music}`,
    ].join("\n\n",);
  } else {
    const labels = input.references?.length
      ? input.references.map((ref, index,) => `<Subject ${index + 1}> is shown in ${ref}.`).join("\n",)
      : "N/A";

    const retention = input.references?.length
      ? input.references.map((_ref, index,) => `<Subject ${index + 1}> (appears in [Shot 1]): fully_preserved`).join(
        "\n",
      )
      : "N/A";

    prompt = [
      `subject_definitions:\n${labels}`,
      `summary:\n${input.shots[0]?.description.trim() ?? "N/A"}`,
      `retention_analysis:\n${retention}`,
      `detailed_description:\n${shotLines.join("\n\n",)}`,
      `overall_soundscape:\n${soundscape}`,
      `non_diegetic_music:\n${music}`,
    ].join("\n\n",);
  }

  const check = validateMinimaxPrompt(prompt, input.mode, { references: input.references, },);
  return check.ok ? { ok: true, prompt, } : { ok: false, missing: check.missing, };
}

export interface MinimaxFormatInput {
  mode: MinimaxMode;
  details: string;
  shots?: string[];
  references?: string[];
  durationSeconds?: number;
}

export interface MinimaxFormatDeps {
  /** Shared AUX caller, injected so tests need no mock.module. */
  call: typeof callAux;
  config: Config;
  db: Kysely<DB>;
  userId?: string;
  chatId?: string;
}

export type MinimaxFormatResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: "aux_unavailable" | "format_mismatch" | "empty_input"; missing?: string[] };

const SHARED_RULES = [
  "Output ONLY the final prompt text: no explanation, no markdown/code fences, no wrapper text, no residual {{...}} placeholders.",
  "First shot is [Shot 1] with NO timestamp. Later shots are [Shot N] At mm:ss.mmm with strictly increasing cut times inside the video duration.",
  "Speakers use stable IDs such as (S1) and (S2). Enclose user-provided dialogue/lyrics as <d>[English] verbatim text</d> and preserve every word and punctuation mark exactly; never translate or rewrite them.",
  "Use N/A for non_diegetic_music when there is no non-diegetic music.",
  "Begin [Shot 1] with the visual style and initial composition; describe only what is visible or audible.",
].join("\n",);

function systemPrompt(mode: MinimaxMode,): string {
  if (mode === "fl2va") {
    return [
      "You are a MiniMax H3 FL2VA video prompt writer. Rewrite the user's plain per-cut scenario in EXACTLY this structure.",
      "The FIRST line must ALWAYS be the alignment instruction (FL2VA always has two endpoint pictures), verbatim in shape:",
      "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.",
      "Replace N with the final shot index and S.SS with the effective duration to exactly two decimals, then output ONE blank line.",
      "Then these three core fields in this order, each heading on its own line:",
      ...FL_HEADINGS,
      SHARED_RULES,
    ].join("\n",);
  }

  return [
    "You are a MiniMax H3 REF2VA video prompt writer. Rewrite the user's plain per-cut scenario in EXACTLY this structure.",
    "These six headings in this order, each on its own line:",
    ...REF_HEADINGS,
    "Reference labels: <Subject N> for who/what appears, <Picture N> for frame anchors, <Video N> for pacing/editing, <Audio N> for sound. Use exactly the labels supplied by the user.",
    "Retention vocabulary: fully_preserved, partially_preserved, attribute_transfer, weak_reference (visual); fully_copy, partially_copy, reference, weak_reference (audio).",
    SHARED_RULES,
  ].join("\n",);
}

function userMessage(input: MinimaxFormatInput, missing?: string[],): string {
  const lines = [
    "Plain per-cut scenario (rewrite into the pinned format):",
    input.details.trim(),
    "",
    `Shots: ${
      input.shots?.length ? input.shots.map((shot, index,) => `${index + 1}. ${shot}`).join(" | ",) : "not supplied"
    }`,
    `References: ${input.references?.length ? input.references.join(", ",) : "not supplied"}`,
    `DurationSeconds: ${input.durationSeconds ?? "not supplied"}`,
  ];

  if (missing?.length) {
    lines.push(
      "",
      `Your previous draft failed these format checks: ${
        missing.join(", ",)
      }. Rewrite the entire prompt so every check passes; output only the prompt.`,
    );
  }

  return lines.join("\n",);
}

function validationOptions(input: MinimaxFormatInput,): MinimaxValidationOptions {
  return { references: input.references, };
}

/**
 * Convert a plain scenario into a validated MiniMax prompt via one AUX call.
 * A format mismatch triggers exactly one re-prompt carrying `missing`; after
 * that the call fails closed so unvalidated text never reaches ComfyUI.
 * @param input - mode, plain details, optional shots/references/duration
 * @param deps - injected callAux-shaped caller plus its config/db context
 * @returns the validated prompt or a closed failure with a reason
 */
export async function formatMinimaxPrompt(
  input: MinimaxFormatInput,
  deps: MinimaxFormatDeps,
): Promise<MinimaxFormatResult> {
  if (!input.details?.trim() && !input.shots?.length) {
    return { ok: false, reason: "empty_input", };
  }

  const system = systemPrompt(input.mode,);
  const user = userMessage(input,);
  const messages: GenerationMessage[] = [
    { role: "system", content: system, },
    { role: "user", content: user, },
  ];

  const callOpts = {
    userId: deps.userId,
    chatId: deps.chatId,
    // Explicit per-call overrides mirror the registry descriptor so a long
    // structured rewrite is never capped by callAux's 100-token default.
    timeoutMs: 15_000,
    maxTokens: 2_000,
    temperature: 0,
  };

  const options = validationOptions(input,);

  const first = await deps.call("minimax-prompt", deps.config, deps.db, messages, callOpts,);
  if (!first?.content?.trim()) { return { ok: false, reason: "aux_unavailable", }; }
  const firstCheck = validateMinimaxPrompt(first.content, input.mode, options,);
  if (firstCheck.ok) { return { ok: true, prompt: first.content.trim(), }; }

  const retryMessages: GenerationMessage[] = [
    ...messages,
    { role: "assistant", content: first.content, },
    { role: "user", content: userMessage(input, firstCheck.missing,), },
  ];

  const second = await deps.call("minimax-prompt", deps.config, deps.db, retryMessages, callOpts,);
  if (!second?.content?.trim()) { return { ok: false, reason: "aux_unavailable", }; }
  const secondCheck = validateMinimaxPrompt(second.content, input.mode, options,);
  if (secondCheck.ok) { return { ok: true, prompt: second.content.trim(), }; }
  return { ok: false, reason: "format_mismatch", missing: secondCheck.missing, };
}
