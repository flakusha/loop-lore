import type { Kysely, } from "kysely";
import { uid, } from "../../../utils.js";
import type { BlogRAGSourceRow, } from "./types";

// ── RAG Sources ──────────────────────────────────────
export async function addRAGSource(
  db: Kysely<any>,
  postId: string,
  source: Omit<BlogRAGSourceRow, "id" | "created_at" | "post_id">,
): Promise<BlogRAGSourceRow> {
  const row = {
    id: uid(),
    post_id: postId,
    source_type: source.source_type,
    uri: source.uri,
    title: source.title,
    relevance_score: source.relevance_score,
    snippet: source.snippet,
    created_at: new Date().toISOString(),
  };

  await db.insertInto("blog_rag_sources",).values(row,).execute();
  return row;
}

export async function getRAGSources(
  db: Kysely<any>,
  postId: string,
): Promise<BlogRAGSourceRow[]> {
  return db
    .selectFrom("blog_rag_sources",)
    .selectAll()
    .where("post_id", "=", postId,)
    .orderBy("relevance_score", "desc",)
    .execute() as Promise<BlogRAGSourceRow[]>;
}
