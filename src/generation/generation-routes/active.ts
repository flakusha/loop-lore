import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonResponse, } from "../../routes/http-utils";
import { listActiveGenerations, } from "../cancellation-manager";

// ── Route: List active generations ─────────────────────────

/**
 * GET /api/generation/active
 *
 * List all currently active generation attempts (admin/debugging).
 */
export function handleListActiveGenerations(_database?: Kysely<DB>,): Response {
  const active = listActiveGenerations();
  return jsonResponse({
    count: active.length,
    generations: active,
  },);
}
