// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Production `Stage2LLMFn` for the two-stage action parser.
 *
 * Stage 1 (`parseActionStage1`) covers the common verbs deterministically;
 * this fallback handles novel inputs by asking the configured LLM for one
 * JSON object constrained to the closed verb enum and the scene's member
 * sets (target in inventory ∪ sceneActors, instrument in inventory).
 *
 * Rejection is the contract: any schema violation — unknown verb, target
 * outside the scene, unparsable JSON — returns `null` so the caller treats
 * the input as unparsed instead of acting on a hallucinated payload.
 *
 * Model selection goes through the existing `resolveModelRole` path
 * (auxiliary role), then `resolveProvider`/`callLlm` — no new provider
 * code. Tests inject `generate` to stay offline.
 *
 * @module regex/stage2-llm
 */

import type { Kysely, } from "kysely";
import { resolveModelRole, } from "../admin/model-roles";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import type { DB, } from "../db";
import { ModelRole, } from "../db/enums-core";
import { callLlm, } from "../generation/auto-gen/call-llm";
import { createDefaultDeps, } from "../generation/auto-gen/deps";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { resolveProvider, } from "../generation/providers/registry";
import { createLogger, getLogger, } from "../logger";
import { safeJsonParse, safeJsonStringify, } from "../utils";
import type { Action, ParseContext, Stage2LLMFn, TargetRef, Verb, } from "./action-parser";
import { VERB_VALUES, } from "./action-parser";

// Lazy logger init — module body must not throw when the global logger
// has not been initialized yet (e.g. direct module import in tests).
try {
  getLogger();
} catch {
  createLogger({ level: "error", },);
}

const log = getLogger().child({ module: "regex/stage2-llm", },);

/** Chat id handed to `callLlm` — parsing is not chat-scoped. */
const NO_CHAT = "__none__";

/** Max accepted completion length. A completion beyond this is junk
 *  (the schema fits in a few hundred chars) and is rejected outright. */
export const MAX_STAGE2_RAW_CHARS = 4_000;

/** Max accepted `displayName` length on a target/instrument ref. */
export const MAX_STAGE2_REF_CHARS = 80;

/** One text-generation call. Defaults to the real `callLlm` pipeline
 *  with the model resolved via `resolveModelRole("auxiliary")`; tests
 *  inject a stub. */
export type Stage2TextGenerator = (req: {
  messages: GenerationMessage[];
},) => Promise<string>;

export interface Stage2ParserOptions {
  db: Kysely<DB>;
  /** Server config. Defaults to `loadConfig()`. */
  config?: Config;
  /** LLM seam. Defaults to the real `callLlm` pipeline. */
  generate?: Stage2TextGenerator;
}

const SYSTEM_PROMPT = [
  "You convert one player input into a game action as a single JSON object.",
  "Schema:",
  '  {"verb": <one of: ' + VERB_VALUES.join(" | ",) + ">,",
  '   "target": {"kind": "item"|"actor", "displayName": <string>},  // optional',
  '   "instrument": {"kind": "item", "displayName": <string>},      // optional',
  '   "confidence": <number 0..1>}',
  "Constraints:",
  "- target.displayName MUST be an entry of the provided inventory or scene actors; otherwise omit target.",
  "- instrument.displayName MUST be an entry of the provided inventory; otherwise omit instrument.",
  "- Output ONLY the JSON object, no prose, no code fences.",
].join("\n",);

/**
 * Build the production Stage-2 parser.
 * @param opts
 * @returns a `Stage2LLMFn` assignable to `parseAction`'s fallback slot
 */
export function createStage2Parser(opts: Stage2ParserOptions,): Stage2LLMFn {
  const { db, } = opts;
  const generate = opts.generate ?? callLlmGenerator({ db, config: opts.config, },);

  return async (input: string, ctx: ParseContext,): Promise<Action | null> => {
    const inventory = ctx.inventory ?? [];
    const sceneActors = ctx.sceneActors ?? [];
    const payload = safeJsonStringify({ input, inventory, sceneActors, },);
    const messages: GenerationMessage[] = [
      { role: "system", content: SYSTEM_PROMPT, },
      { role: "user", content: payload.ok ? payload.value : "{}", },
    ];

    let raw: string;
    try {
      raw = await generate({ messages, },);
    } catch (error) {
      log.warn("stage2: generation failed — treating input as unparsed", {
        error: error instanceof Error ? error.message : String(error,),
      },);

      return null;
    }

    const action = validateStage2Output(raw, ctx,);
    if (action === null) {
      log.warn("stage2: model output violated the action schema — rejected", {
        contentLength: raw.length,
      },);
    }

    return action;
  };
}

/**
 * Validate one raw model completion against the constrained schema and
 * the scene member sets. Returns `null` on ANY violation.
 * @param raw
 * @param ctx
 */
export function validateStage2Output(raw: string, ctx: ParseContext,): Action | null {
  if (raw.length > MAX_STAGE2_RAW_CHARS) { return null; }

  const result = safeJsonParse<unknown>(raw,);
  if (!result.ok) { return null; }
  const parsed = result.value;

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed,)) { return null; }
  const obj = parsed as Record<string, unknown>;

  const verb = obj.verb;
  if (typeof verb !== "string" || !VERB_VALUES.includes(verb as Verb,)) { return null; }

  const target = validateRef(obj.target, ["item", "actor",], ctx,);
  if (target === undefined) { return null; }

  const instrument = validateRef(obj.instrument, ["item",], ctx,);
  if (instrument === undefined) { return null; }

  const confidence = typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
    ? obj.confidence
    : 0.5;

  const action: Action = {
    verb: verb as Verb,
    agency_mode: "free",
    confidence,
    parser_stage: "stage2",
    raw,
  };

  if (target !== null) { action.target = target; }
  if (instrument !== null) { action.instrument = instrument; }
  return action;
}

/**
 * Validate one optional target/instrument ref. `null` = legally omitted;
 * `undefined` = present but invalid (rejects the whole output).
 * @param value
 * @param kinds
 * @param ctx
 */
function validateRef(
  value: unknown,
  kinds: ReadonlyArray<"item" | "actor">,
  ctx: ParseContext,
): TargetRef | null | undefined {
  if (value === undefined || value === null) { return null; }
  if (typeof value !== "object" || Array.isArray(value,)) { return undefined; }

  const ref = value as Record<string, unknown>;
  const kind = ref.kind;
  const displayName = ref.displayName;
  if (
    typeof kind !== "string" ||
    !kinds.includes(kind as "item" | "actor",) ||
    typeof displayName !== "string" ||
    displayName.trim().length < 1 ||
    displayName.trim().length > MAX_STAGE2_REF_CHARS
  ) {
    return undefined;
  }

  // Member-set constraint: the ref must name something the scene holds.
  const inventory = ctx.inventory ?? [];
  const sceneActors = ctx.sceneActors ?? [];
  const allowed = kind === "item" ? inventory : [...inventory, ...sceneActors,];
  const hit = allowed.some((entry,) => entry.toLowerCase() === displayName.trim().toLowerCase());
  if (!hit) { return undefined; }

  return { kind: kind as TargetRef["kind"], displayName: displayName.trim(), };
}

/**
 * Default generator: model role `auxiliary` → provider resolution → the
 * canonical LLM helper.
 * @param args
 * @param args.db
 * @param args.config
 */
function callLlmGenerator(args: { db: Kysely<DB>; config?: Config },): Stage2TextGenerator {
  return async (req,) => {
    const config = args.config ?? loadConfig();
    const role = await resolveModelRole(ModelRole.Auxiliary, config, args.db,);
    const resolved = await resolveProvider({
      config,
      db: args.db,
      provider: role.provider || undefined,
      model: role.model || undefined,
    },);

    const llm = await callLlm({
      d: createDefaultDeps(),
      database: args.db,
      config,
      chatId: NO_CHAT,
      parentMessageId: null,
      resolved,
      prompt: { messages: req.messages, },
      actorName: "action-parser",
      // Never stream: nothing renders this text.
      chatStreaming: 0,
    },);

    return llm.content;
  };
}
