// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model News — keyless feed fan-in for the admin surface.
 *
 * Polls GitHub Atom release feeds, the HuggingFace blog RSS, and the
 * HF models API (the three stable, no-token families from research),
 * and stores each poll as a versioned `ranking_snapshots` row
 * (`source='news:<family>'`). Feeds are rolling windows (10–20
 * entries), so every poll appends a new versioned row — history
 * accumulates instead of being reconstructed.
 *
 * No XML dependency: the extractor targets the verified Atom/RSS
 * shape (entry/item → title, link, updated, author) only.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { toDate, } from "../utils/date";
import { dismissedNewsIds, } from "./news-triage";
import { freshSnapshot, storeSnapshot, } from "./snapshots";

/** One normalized news item. */
export interface NewsItem {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  author: string | null;
}

interface NewsFeed {
  family: string;
  url: string;
  kind: "atom" | "rss" | "hf-models";
}

/**
 * The static feed list. Fixed owners/branches on purpose: feed URLs
 * 404 on renames (tabbyAPI moved orgs) and on wrong branch names.
 *
 * ponytail: static list; admin-editable feed registry when admins
 * actually ask for custom feeds.
 */
export const NEWS_FEEDS: NewsFeed[] = [
  { family: "llama.cpp", url: "https://github.com/ggml-org/llama.cpp/releases.atom", kind: "atom", },
  { family: "llama-swap", url: "https://github.com/mostlygeek/llama-swap/releases.atom", kind: "atom", },
  { family: "ollama", url: "https://github.com/ollama/ollama/releases.atom", kind: "atom", },
  { family: "hf-blog", url: "https://huggingface.co/blog/feed.xml", kind: "rss", },
  {
    family: "hf-models",
    url: "https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=20&filter=gguf",
    kind: "hf-models",
  },
];

export const NEWS_REFRESH_MS = 6 * 3_600_000;

function tag(block: string, name: string,): string | null {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i",),);
  return match?.[1]?.trim() || null;
}

function attr(block: string, tagName: string, attrName: string,): string | null {
  const match = block.match(new RegExp(`<${tagName}[^>]*${attrName}="([^"]*)"`, "i",),);
  return match?.[1]?.trim() || null;
}

function unescapeXml(text: string,): string {
  return text
    .replace(/&lt;/g, "<",)
    .replace(/&gt;/g, ">",)
    .replace(/&amp;/g, "&",)
    .replace(/&quot;/g, '"',)
    .replace(/&#39;/g, "'",);
}

/**
 * Minimal Atom/RSS extractor: title, link, updated, author per
 * entry/item. Skips the HTML body — the admin tab shows headlines.
 * @param xml - raw feed body
 */
export function parseFeed(xml: string,): NewsItem[] {
  const blocks = xml.match(/<(entry|item)[\s>][\s\S]*?<\/\1>/gi,) ?? [];
  const items: NewsItem[] = [];
  for (const block of blocks) {
    const title = tag(block, "title",);
    if (!title) { continue; }
    const url = attr(block, "link", "href",) ?? tag(block, "link",) ?? tag(block, "guid",);
    const authorRaw = block.match(/<author[\s>][\s\S]*?<\/author>/i,)?.[0];
    items.push({
      id: tag(block, "id",) ?? url ?? title,
      title: unescapeXml(title,),
      url: url ? unescapeXml(url,) : null,
      publishedAt: tag(block, "updated",) ?? tag(block, "pubDate",) ?? null,
      author: authorRaw ? tag(authorRaw, "name",) : null,
    },);
  }

  return items;
}

/**
 * HF models API extractor: model id + lastModified per row.
 * @param json - raw `/api/models` response body
 */
export function parseHfModels(json: string,): NewsItem[] {
  const rows = jsonParseOr<unknown>(json, null,);
  if (!Array.isArray(rows,)) { return []; }
  const items: NewsItem[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) { continue; }
    const record = row as Record<string, unknown>;
    if (typeof record["id"] !== "string") { continue; }
    const id = record["id"] as string;
    items.push({
      id,
      title: id,
      url: `https://huggingface.co/${id}`,
      publishedAt: typeof record["lastModified"] === "string" ? record["lastModified"] : null,
      author: null,
    },);
  }

  return items;
}

type FetchImpl = (url: string, init?: RequestInit,) => Promise<Response>;

async function fetchText(fetchImpl: FetchImpl, url: string,): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000,);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/atom+xml, application/rss+xml, application/json, */*",
        "User-Agent": "loop-lore-model-news/1 (+https://github.com/loop-lore)",
      },
    },);

    if (!res.ok) { return null; }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer,);
  }
}

/**
 * Poll one feed and append a versioned snapshot row. Returns the item
 * count, or 0 when the fetch/parse failed (failure keeps the previous
 * snapshot — the tab shows stale-with-timestamp, never an error).
 * @param db
 * @param feed
 * @param fetchImpl - injectable for tests
 */
export async function pollFeed(db: Kysely<DB>, feed: NewsFeed, fetchImpl: FetchImpl = fetch,): Promise<number> {
  const body = await fetchText(fetchImpl, feed.url,);
  if (body === null) {
    getLogger().child({ module: "model-news", },).warn("feed fetch failed", { family: feed.family, },);
    return 0;
  }

  const items = feed.kind === "hf-models" ? parseHfModels(body,) : parseFeed(body,);
  if (items.length === 0) { return 0; }
  const now = toDate();
  await storeSnapshot(db, {
    source: `news:${feed.family}`,
    sourceKey: feed.url,
    version: `poll-${now.toISOString()}`,
    nextRefreshAfter: toDate(now.getTime() + NEWS_REFRESH_MS,).toISOString(),
    rowCount: items.length,
    payload: jsonStringifyOr(items,),
  },);

  return items.length;
}

/**
 * Poll every configured feed. Per-feed failures degrade to 0 items;
 * a failed feed never clears its previous snapshot.
 * @param db
 * @param fetchImpl - injectable for tests
 * @returns total items stored across feeds
 */
export async function pollAllFeeds(db: Kysely<DB>, fetchImpl: FetchImpl = fetch,): Promise<number> {
  let total = 0;
  for (const feed of NEWS_FEEDS) {
    total += await pollFeed(db, feed, fetchImpl,);
  }

  getLogger().child({ module: "model-news", },).info("news poll complete", { total, },);
  return total;
}

/** Latest items per feed family, newest poll first. */
export interface NewsFamily {
  family: string;
  refreshedAt: string | null;
  items: NewsItem[];
  dismissedIds: string[];
}

/**
 * Read the freshest snapshot per feed for the admin tab. Families
 * without any snapshot report empty items (tab renders "not yet
 * polled"); expired snapshots still render — stale-with-data beats
 * an empty tab.
 * @param db
 */
export async function latestNews(db: Kysely<DB>,): Promise<NewsFamily[]> {
  const dismissed = await dismissedNewsIds(db,);
  const dismissedIds = [...dismissed,];
  const out: NewsFamily[] = [];
  for (const feed of NEWS_FEEDS) {
    const payload = await freshSnapshot(db, `news:${feed.family}`, feed.url,);
    if (payload === null) {
      // Fall back to the newest snapshot regardless of freshness.
      const row = await db
        .selectFrom("ranking_snapshots",)
        .select(["version", "payload",],)
        .where("source", "=", `news:${feed.family}`,)
        .where("source_key", "=", feed.url,)
        .orderBy("version", "desc",)
        .limit(1,)
        .executeTakeFirst();

      out.push({
        dismissedIds,
        family: feed.family,
        refreshedAt: row?.version.replace(/^poll-/, "",) ?? null,
        items: row ? jsonParseOr<NewsItem[]>(row.payload, [],) : [],
      },);

      continue;
    }

    out.push({
      dismissedIds,
      family: feed.family,
      refreshedAt: toDate().toISOString(),
      items: jsonParseOr<NewsItem[]>(payload, [],),
    },);
  }

  return out;
}
