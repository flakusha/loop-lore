// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Preview orchestration for content merges (FEA-2026-047). Extracted
 * from `merge-service.ts` to stay under the 250-line budget.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { checkChatAccess, } from "../access";
import {
  baseOrdinal,
  type MergeDraftMessage,
  type MergeError,
  MergeMode,
  overlayOrdinal,
  previewRequestFor,
} from "./merge-criteria";
import type { MergeHunk, } from "./merge-diff";
import { resolveMergeGraph, } from "./merge-graph";
import {
  buildMergePromptMessages,
  parseMergeDraft,
  planMergeBudget,
  resolveMergeSystemPrompt,
  truncateLines,
} from "./merge-llm";
import { callMergeLlm, } from "./merge-llm-call";
import { changedLineRatio, threeWayOverlay, } from "./merge-overlay";
import {
  loadAncestorPath,
  loadSourceTips,
  parseMetadata,
  renderTailLines,
} from "./merge-render";
import {
  loadMerge,
  updateMergeMetadata,
} from "./merge-store";

/** Default model context window when provider capabilities are silent. */
const DEFAULT_CONTEXT_WINDOW = 32_000;
/** Tokens reserved for the LLM output. */
const RESERVE_OUTPUT_TOKENS = 2048;
/** Guard threshold for single-plus-glean (mode 5). */
const GLEAN_MAX_CHANGED_RATIO = 0.3;

/** Options for {@link buildPreview}. */
export interface BuildPreviewOptions {
  database: Kysely<DB>;
  config: Config;
  params: {
    chatId: string;
    mergeId: string;
    actorId: string;
    userRole: string | null;
    regenerate?: boolean;
    styleHint?: string;
  };
}

/** Result of {@link buildPreview}. */
export type BuildPreviewResult =
  | {
    ok: true;
    mergeId: string;
    mode: MergeMode;
    kind: "llm" | "overlay";
    draft?: MergeDraftMessage[];
    hunks?: MergeHunk[];
    tokenEstimate: { sharedPrefix: number; perSource: number[] };
    truncated: boolean;
  }
  | MergeError;

/**
 * Build (or rebuild) the merge preview. LLM modes call the model; overlay
 * modes recompute deterministic hunks. The preview is stored in metadata
 * so confirm can detect stale-preview edits.
 * @param options
 * @throws {Error} when the DB driver fails
 * @returns {Promise<BuildPreviewResult>}
 */
export async function buildPreview(options: BuildPreviewOptions,): Promise<BuildPreviewResult> {
  const { database, config, params, } = options;
  const { chatId, mergeId, actorId, userRole, regenerate, styleHint, } = params;

  const access = await checkChatAccess(database, chatId, actorId, userRole,);
  if (!access.ok) { return access.error; }

  const merge = await loadMerge(database, mergeId,);
  if (!merge || merge.chat_id !== chatId) {
    return { code: "not_found", message: "Merge not found", };
  }

  const mode = merge.mode as MergeMode;
  const request = previewRequestFor(mode, styleHint,);

  // Idempotency (design 3.5): a stored LLM preview is replayed unless the
  // caller explicitly asks to regenerate, so a retry does not re-bill.
  if (request.kind === "llm" && regenerate !== true) {
    const stored = parseMetadata(merge.metadata,).preview;
    if (stored?.kind === "llm" && stored.draft) {
      return {
        ok: true,
        mergeId,
        mode,
        kind: "llm",
        draft: stored.draft,
        tokenEstimate: stored.tokenEstimate,
        truncated: stored.truncated,
      };
    }
  }

  const graphResult = await resolveMergeGraph(database, {
    chatId,
    tips: await loadSourceTips(database, mergeId,),
  },);

  if (!("ok" in graphResult)) { return graphResult; }
  const { graph, } = graphResult;

  const ancestorLines = await renderTailLines(
    database,
    chatId,
    await loadAncestorPath(database, chatId, graph.baseMessageId,),
  );

  if (!ancestorLines) {
    return { code: "not_found", message: "Ancestor messages not found", };
  }

  const versionLines: string[][] = [];
  for (const source of graph.sources) {
    const lines = await renderTailLines(database, chatId, source.tail,);
    if (!lines) {
      return { code: "not_found", message: "Source messages not found", };
    }

    versionLines.push(lines,);
  }

  if (request.kind === "overlay") {
    const base = baseOrdinal(mode,)!;
    const overlay = overlayOrdinal(mode,)!;
    const hunks = threeWayOverlay(ancestorLines, versionLines[base]!, versionLines[overlay]!,);
    const metadata = parseMetadata(merge.metadata,);
    metadata.preview = {
      kind: "overlay",
      hunks,
      tokenEstimate: { sharedPrefix: 0, perSource: [], },
      truncated: false,
      generatedAt: new Date().toISOString(),
      attempts: 0,
    };

    await updateMergeMetadata(database, { mergeId, metadata, },);
    return {
      ok: true,
      mergeId,
      mode,
      kind: "overlay",
      hunks,
      tokenEstimate: { sharedPrefix: 0, perSource: [], },
      truncated: false,
    };
  }

  // LLM modes: budget + prompt + call + parse
  const systemPrompt = resolveMergeSystemPrompt(config,);
  const budget = planMergeBudget({
    sharedContext: ancestorLines,
    versions: versionLines,
    maxContextTokens: DEFAULT_CONTEXT_WINDOW,
    reserveOutputTokens: RESERVE_OUTPUT_TOKENS,
  },);

  if (!("ok" in budget)) { return budget; }

  const truncatedVersions = versionLines.map((lines, i,) => {
    const tokens = budget.perSource[i] ?? 0;
    const full = lines.reduce((sum, l,) => sum + Math.ceil(l.length / 4,), 0,);
    return full > tokens ? truncateLines(lines, tokens,) : lines;
  },);

  const messages = buildMergePromptMessages({
    systemPrompt,
    sharedContext: ancestorLines,
    versions: truncatedVersions,
    mode,
  },);

  const llmResult = await callMergeLlm(database, config, chatId, actorId, messages,);
  if (!("ok" in llmResult)) { return llmResult; }

  const parsed = parseMergeDraft(llmResult.content,);
  if (!("ok" in parsed)) { return parsed; }

  // Mode 5 guard: changed-line ratio against version A
  let changedRatio: number | undefined;
  let guardExceeded = false;
  if (mode === MergeMode.SinglePlusGlean) {
    const aLines = versionLines[0]!;
    const draftText = parsed.messages.map((m: { role: string; content: string },) => `${m.role}: ${m.content}`).join(
      "\n",
    );

    const draftLines = draftText.split("\n",);
    changedRatio = changedLineRatio(aLines, draftLines,);
    guardExceeded = changedRatio > GLEAN_MAX_CHANGED_RATIO;
  }

  const metadata = parseMetadata(merge.metadata,);
  metadata.preview = {
    kind: "llm",
    draft: parsed.messages,
    tokenEstimate: { sharedPrefix: budget.sharedPrefix, perSource: budget.perSource, },
    truncated: budget.truncated,
    generatedAt: new Date().toISOString(),
    attempts: (metadata.preview?.attempts ?? 0) + 1,
  };

  if (changedRatio !== undefined) { metadata.changedRatio = changedRatio; }
  if (guardExceeded) { metadata.guardExceeded = true; }
  await updateMergeMetadata(database, { mergeId, metadata, },);

  return {
    ok: true,
    mergeId,
    mode,
    kind: "llm",
    draft: parsed.messages,
    tokenEstimate: { sharedPrefix: budget.sharedPrefix, perSource: budget.perSource, },
    truncated: budget.truncated,
  };
}
