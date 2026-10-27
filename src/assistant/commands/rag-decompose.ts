// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/rag-decompose <doc-id>` — re-run the document decomposer over a lore
 * document and return its human + structured representations (epic batch B1
 * remainder).
 *
 * The unified document model / dedicated decomposer
 * (`epic-rag-assets-unified-storage-and-assistant-flows.md`) has not landed,
 * so per the epic this composes the existing substrate: the lore row is the
 * document, the aux LLM (`rag-ask` task, `ModelRole` resolution inside the
 * aux runner) proposes the structured decomposition, and a deterministic
 * keyword/sentence split is the fallback when the aux call returns null.
 */

import { callAux, } from "../../aux-pipeline";
import { requireWorldAccess, } from "../../routes/worlds/access";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

/** The structured half of a decomposition. */
export interface LoreDecomposition {
  summary: string;
  topics: string[];
  entities: string[];
  keywords: string[];
}

/** Stopwords stripped by the deterministic keyword split. */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "be",
  "it",
  "its",
  "that",
  "this",
  "with",
  "for",
],);

/** Maximum keywords emitted by the deterministic split. */
const MAX_KEYWORDS = 12;

/**
 * Deterministic keyword/sentence decomposition — the no-LLM fallback and the
 * same shape the aux prompt asks the model to fill.
 * @param content - the document text
 * @returns summary (first sentence), topics (sentences), entities (capitalized terms), keywords (ranked terms)
 */
export function deterministicDecompose(content: string,): LoreDecomposition {
  const sentences = content
    .split(/(?<=[.!?])\s+/,)
    .map((s,) => s.trim())
    .filter((s,) => s.length > 0);

  const frequencies = new Map<string, number>();
  for (const term of content.toLowerCase().split(/[^a-z0-9]+/,)) {
    if (term.length < 3 || STOPWORDS.has(term,)) { continue; }
    frequencies.set(term, (frequencies.get(term,) ?? 0) + 1,);
  }

  const keywords = [...frequencies.entries(),]
    .sort((a, b,) => b[1] - a[1] || a[0].localeCompare(b[0],))
    .slice(0, MAX_KEYWORDS,)
    .map(([term,],) => term);

  const entities = [
    ...new Set(
      content.split(/[^A-Za-z0-9]+/,).filter((w,) => /^[A-Z][a-z]+$/.test(w,)),
    ),
  ];

  return {
    summary: sentences[0] ?? "",
    topics: sentences,
    entities,
    keywords,
  };
}

/**
 * Parse the aux model's decomposition JSON, tolerating code fences.
 * @param raw - the model's completion text
 * @returns the parsed decomposition, or null when the payload is unusable
 */
export function parseDecomposition(raw: string,): LoreDecomposition | null {
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/, "",).replace(/\n?```\s*$/, "",);
  const parsed = safeJsonParse<Partial<LoreDecomposition>>(cleaned,);
  if (!parsed.ok || typeof parsed.value.summary !== "string") { return null; }

  const asStrings = (v: unknown,): string[] =>
    Array.isArray(v,) ? v.filter((x,): x is string => typeof x === "string") : [];

  return {
    summary: parsed.value.summary,
    topics: asStrings(parsed.value.topics,),
    entities: asStrings(parsed.value.entities,),
    keywords: asStrings(parsed.value.keywords,),
  };
}

registerCommand("rag-decompose", async (args, ctx,): Promise<CommandResult> => {
  const docId = args[0] || "";
  if (!docId) {
    return { systemMessage: "Usage: /rag-decompose <doc-id>", handled: true, };
  }

  const { db, config, } = ctx;
  if (!db) {
    return { systemMessage: "**RAG decompose unavailable:** command context missing database.", handled: true, };
  }

  const doc = await db
    .selectFrom("world_lore_entries",)
    .select(["name", "content", "world_id",],)
    .where("id", "=", docId,)
    .executeTakeFirst();

  if (!doc) {
    return { systemMessage: `Document ${docId} not found.`, handled: true, };
  }

  const denied = await requireWorldAccess(db, doc.world_id, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: `Document ${docId} not found or not accessible to you.`, handled: true, };
  }

  let decomposition: LoreDecomposition | null = null;
  let via = "keyword fallback";
  if (config) {
    const aux = await callAux(
      "rag-ask",
      config,
      db,
      [
        {
          role: "user",
          content: [
            "Decompose the following lore document. Answer ONLY with JSON:",
            '{"summary": string, "topics": string[], "entities": string[], "keywords": string[]}',
            "",
            doc.content,
          ].join("\n",),
        },
      ],
      { userId: ctx.userId, chatId: ctx.chatId, maxTokens: 500, temperature: 0, },
    );

    if (aux) {
      decomposition = parseDecomposition(aux.content,);
      if (decomposition) { via = `aux model ${aux.model}`; }
    }
  }

  if (!decomposition) {
    decomposition = deterministicDecompose(doc.content,);
  }

  const structRepr = jsonStringifyOr(decomposition, "{}",);
  return {
    systemMessage: [
      `**Decomposition of ${doc.name ?? docId}** (${via}):`,
      "",
      `**humanRepr** — ${doc.content}`,
      "",
      `**structRepr**
\`\`\`json\n${structRepr}\n\`\`\``,
    ].join("\n",),
    handled: true,
  };
}, { requiredRole: "member", },);
