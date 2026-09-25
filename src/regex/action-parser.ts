// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Action Parser — Two-stage verb×target parser (replaces keyword-only intent routing).
 */

import { type AssistantIntent, } from "./intent";

export const VERB = {
  Use: "use",
  Equip: "equip",
  Unequip: "unequip",
  Drop: "drop",
  Give: "give",
  Take: "take",
  Open: "open",
  Close: "close",
  Read: "read",
  Examine: "examine",
  Attack: "attack",
  Defend: "defend",
  Talk: "talk",
  Move: "move",
  Hide: "hide",
  Search: "search",
} as const;
export type Verb = (typeof VERB)[keyof typeof VERB];
export const VERB_VALUES: readonly Verb[] = Object.values(VERB);

export interface TargetRef {
  kind: "item" | "actor" | "location" | "exit";
  id?: string;
  displayName: string;
}

export type AgencyMode = "free" | "forced" | "blocked" | "skipped";
export type ParserStage = "stage1" | "stage2";

export interface Action {
  verb: Verb;
  target?: TargetRef;
  instrument?: TargetRef;
  agency_mode: AgencyMode;
  confidence: number;
  parser_stage: ParserStage;
  raw?: string;
}

export interface ParseContext {
  inventory?: readonly string[];
  sceneActors?: readonly string[];
  sceneExits?: readonly string[];
}
export type Stage2LLMFn = (input: string, ctx: ParseContext) => Promise<Action | null>;

interface VerbPattern {
  readonly verb: Verb;
  readonly patterns: readonly RegExp[];
  readonly confidence: number;
}

const VERB_PATTERNS: readonly VerbPattern[] = [
  { verb: VERB.Attack, confidence: 0.9, patterns: [/\battack\b/i, /\bstrike\b/i, /\bhit\b/i, /\bfight\b/i, /\bslash\b/i, /\bstab\b/i,], },
  { verb: VERB.Defend, confidence: 0.85, patterns: [/\bdefend\b/i, /\bblock\b/i, /\bparry\b/i, /\bdodge\b/i, /\bshield\b/i,], },
  { verb: VERB.Equip, confidence: 0.9, patterns: [/\bequip\b/i, /\bwield\b/i, /\bsheath\b/i, /\bput on\b/i, /\bdon\b/i,], },
  { verb: VERB.Unequip, confidence: 0.9, patterns: [/\bunequip\b/i, /\bholster\b/i, /\bremove\b/i, /\btake off\b/i, /\bd off\b/i,], },
  { verb: VERB.Use, confidence: 0.8, patterns: [/\buse\b/i, /\bdrink\b/i, /\beat\b/i, /\bactivate\b/i, /\bapply\b/i, /\bcast\b/i,], },
  { verb: VERB.Drop, confidence: 0.9, patterns: [/\bdrop\b/i, /\bdiscard\b/i, /\bthrow away\b/i, /\btoss\b/i,], },
  { verb: VERB.Give, confidence: 0.9, patterns: [/\bgive\b/i, /\boffer\b/i, /\bhand over\b/i, /\bpresent\b/i, /\bdonate\b/i,], },
  { verb: VERB.Take, confidence: 0.9, patterns: [/\btake\b/i, /\bpick up\b/i, /\bgrab\b/i, /\bsnatch\b/i, /\bcollect\b/i, /\bloot\b/i,], },
  { verb: VERB.Open, confidence: 0.9, patterns: [/\bopen\b/i, /\bunseal\b/i, /\bunlock\b/i, /\bunbar\b/i,], },
  { verb: VERB.Close, confidence: 0.9, patterns: [/\bclose\b/i, /\bshutdown\b/i, /\bseal\b/i, /\bbar\b/i, /\bshut\b/i,], },
  { verb: VERB.Read, confidence: 0.9, patterns: [/\bread\b/i, /\bstudy\b/i, /\bperuse\b/i, /\bscan (?:the )?text\b/i,], },
  { verb: VERB.Examine, confidence: 0.85, patterns: [/\bexamine\b/i, /\binspect\b/i, /\blook at\b/i, /\bcheck\b/i, /\bobserve\b/i,], },
  { verb: VERB.Talk, confidence: 0.85, patterns: [/\btalk\b/i, /\bspeak\b/i, /\bsay\b/i, /\bask\b/i, /\bgreet\b/i, /\bchat\b/i, /\bwhisper\b/i,], },
  { verb: VERB.Move, confidence: 0.85, patterns: [/\bmove\b/i, /\bwalk\b/i, /\bgo\b/i, /\bhead\b/i, /\bleave\b/i, /\benter\b/i, /\brun\b/i, /\bclimb\b/i, /\bcrawl\b/i, /\bjump\b/i,], },
  { verb: VERB.Hide, confidence: 0.9, patterns: [/\bhide\b/i, /\bsneak\b/i, /\bconceal\b/i, /\bcrouch\b/i, /\bstalk\b/i,], },
  { verb: VERB.Search, confidence: 0.9, patterns: [/\bsearch\b/i, /\bscavenge\b/i, /\binvestigate\b/i, /\bforage\b/i, /\bscrutinize\b/i, /\bprobe\b/i,], },
];

function extractTarget(input: string, verbMatchIndex: number,): TargetRef | undefined {
  const tail = input.slice(verbMatchIndex,).replace(/^[^\w]+/, "",);
  const m = /^(?:with|using|on|at|to)?\s*(?:the\s+|a\s+)?([\w' -]{2,40})/i.exec(tail,);
  if (!m) { return undefined; }
  const displayName = (m[1] ?? "").trim();
  if (!displayName || displayName.length < 2) { return undefined; }
  return { kind: "item", displayName, };
}

export async function parseAction(
  input: string,
  stage2?: Stage2LLMFn,
  ctx: ParseContext = {},
): Promise<Action | null> {
  const trimmed = input.trim();
  if (!trimmed) { return null; }
  const lower = trimmed.toLowerCase();

  for (const { verb, patterns, confidence, } of VERB_PATTERNS) {
    for (const pat of patterns) {
      const m = pat.exec(lower,);
      if (!m) { continue; }
      const action: Action = {
        verb,
        agency_mode: "free",
        confidence,
        parser_stage: "stage1",
        raw: trimmed,
      };
      const target = extractTarget(trimmed, m.index + m[0].length - (m[1]?.length ?? 0) || m.index,);
      if (target) { action.target = target; }
      return action;
    }
  }

  if (stage2) {
    const fallback = await stage2(trimmed, ctx,);
    if (fallback) {
      fallback.parser_stage = "stage2";
      fallback.agency_mode ??= "free";
      return fallback;
    }
  }

  return null;
}

export function actionToLegacyIntent(
  action: Action,
): { intent: AssistantIntent; target: string; confidence: number } {
  const target = action.target?.displayName ?? "";
  const confidence = action.confidence;
  let intent: AssistantIntent;
  switch (action.verb) {
    case VERB.Search:
    case VERB.Read:
    case VERB.Examine: { intent = "tool_exec"; break; }
    case VERB.Attack:
    case VERB.Defend: { intent = "api_call"; break; }
    case VERB.Talk:
    case VERB.Move:
    case VERB.Hide: { intent = "chat"; break; }
    default: { intent = "generate"; }
  }
  return { intent, target, confidence, };
}

export function parseActionStage1(input: string,): Action | null {
  const trimmed = input.trim();
  if (!trimmed) { return null; }
  const lower = trimmed.toLowerCase();
  for (const { verb, patterns, confidence, } of VERB_PATTERNS) {
    for (const pat of patterns) {
      const m = pat.exec(lower,);
      if (!m) { continue; }
      const action: Action = {
        verb,
        agency_mode: "free",
        confidence,
        parser_stage: "stage1",
        raw: trimmed,
      };
      const target = extractTarget(trimmed, m.index + m[0].length - (m[1]?.length ?? 0) || m.index,);
      if (target) { action.target = target; }
      return action;
    }
  }
  return null;
}
