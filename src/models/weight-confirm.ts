// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Weight-change confirmation — `lastModified` moves on any commit
 * (README edits included), so the news fan-in's "new models" rows
 * are rumours until confirmed. Per-model `/commits/main` joined
 * with the file tree confirms a genuine weight change: commits whose
 * tree diff touches a `.gguf` file. Stored as a `ranking_snapshots`
 * row (`source='news:weight-change'`, keyed per model) — the admin
 * tab reads the snapshot, never the network.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { storeSnapshot, } from "./snapshots";

export const WEIGHT_CHANGE_REFRESH_MS = 24 * 3_600_000;

/** One commit row from the HF `/commits/{revision}` API. */
export interface HfCommit {
  id: string;
  title: string;
  date: string;
}

/** One tree row from the HF `/tree/{revision}` API. */
export interface HfTreeEntry {
  type: string;
  path: string;
  oid: string;
}

interface TreeSnapshot {
  sha: string | null;
  entries: HfTreeEntry[];
}

export type WeightFetch = (url: string, init?: RequestInit,) => Promise<Response>;

async function fetchJson(fetchImpl: WeightFetch, url: string,): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000,);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, },);
    if (!res.ok) { return null; }
    return jsonParseOr<unknown>(await res.text(), null,);
  } catch {
    return null;
  } finally {
    clearTimeout(timer,);
  }
}

/**
 * Extract commit rows from the HF commits API body.
 * @param body - raw `/commits/main` JSON
 */
export function parseHfCommits(body: unknown,): HfCommit[] {
  if (!Array.isArray(body,)) { return []; }
  const out: HfCommit[] = [];
  for (const row of body) {
    if (typeof row !== "object" || row === null) { continue; }
    const record = row as Record<string, unknown>;
    const id = typeof record["id"] === "string" ? record["id"] : null;
    const date = typeof record["date"] === "string" ? record["date"] : null;
    if (!id || !date) { continue; }
    out.push({ id, title: typeof record["title"] === "string" ? record["title"] : "", date, },);
  }

  return out;
}

/**
 * Extract file entries from the HF tree API body.
 * @param body - raw `/tree/main` JSON
 */
export function parseHfTree(body: unknown,): HfTreeEntry[] {
  if (!Array.isArray(body,)) { return []; }
  const out: HfTreeEntry[] = [];
  for (const row of body) {
    if (typeof row !== "object" || row === null) { continue; }
    const record = row as Record<string, unknown>;
    const path = typeof record["path"] === "string" ? record["path"] : null;
    if (!path) { continue; }
    out.push({
      type: typeof record["type"] === "string" ? record["type"] : "",
      path,
      oid: typeof record["oid"] === "string" ? record["oid"] : "",
    },);
  }

  return out;
}

function isWeightPath(path: string,): boolean {
  return path.toLowerCase().endsWith(".gguf",);
}

async function modelHead(modelId: string, fetchImpl: WeightFetch,): Promise<HfCommit | null> {
  // One commit is enough: the head tells "changed at T"; the tree
  // tells whether T moved weights. Full history is a fan-in
  // refinement, not this slice.
  const body = await fetchJson(fetchImpl, `https://huggingface.co/api/models/${modelId}/commits/main?limit=1`,);
  return parseHfCommits(body,)[0] ?? null;
}

async function modelTree(modelId: string, fetchImpl: WeightFetch,): Promise<TreeSnapshot> {
  const card = await fetchJson(fetchImpl, `https://huggingface.co/api/models/${modelId}`,);
  const sha = typeof card === "object" && card !== null
    ? (card as Record<string, unknown>)["sha"]
    : null;

  const body = await fetchJson(fetchImpl, `https://huggingface.co/api/models/${modelId}/tree/main`,);
  return {
    sha: typeof sha === "string" ? sha : null,
    entries: parseHfTree(body,),
  };
}

/**
 * Confirm whether a model's head commit moved weights: the tree at
 * head must contain a `.gguf` file. `lastModified`-only changes
 * (README, metadata) confirm as false.
 * @param db
 * @param modelId - `org/name` model id
 * @param fetchImpl - injectable for tests
 * @returns true when the head commit carries weight files
 */
export async function confirmWeightChange(
  db: Kysely<DB>,
  modelId: string,
  fetchImpl: WeightFetch = fetch,
): Promise<boolean> {
  const head = await modelHead(modelId, fetchImpl,);
  if (!head) {
    getLogger().child({ module: "model-news", },).warn("weight confirm: no commits", { modelId, },);
    return false;
  }

  const tree = await modelTree(modelId, fetchImpl,);
  const weights = tree.entries.some((entry,) => entry.type === "file" && isWeightPath(entry.path,));
  const now = toDate();
  await storeSnapshot(db, {
    source: "news:weight-change",
    sourceKey: modelId,
    version: `confirm-${head.id}`,
    nextRefreshAfter: toDate(now.getTime() + WEIGHT_CHANGE_REFRESH_MS,).toISOString(),
    rowCount: weights ? 1 : 0,
    payload: jsonStringifyOr({ modelId, head, sha: tree.sha, weightChange: weights, checkedAt: now.toISOString(), },),
    status: "ok",
  },);

  return weights;
}
