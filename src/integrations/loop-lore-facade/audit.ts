// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/audit.ts — one `log_entries` audit row per
// facade call (epic requirement: "an audit row per facade call").
//
// REUSES the repo's shared audit sink: `logEntryEnvelope` + a direct
// `log_entries` insert — the same writer shape as
// generation/providers/server-provider-audit.ts and chat/moderation.ts.
// The /api/admin/audit route READS this table; no new table, no migration.

import type { Kysely, } from "kysely";
import { logEntryEnvelope, } from "../../db/log-entries";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import type { FacadePrincipal, FacadeScope, } from "./types";

/** Everything the audit row records about one facade call. */
export interface FacadeAuditEntry {
  op: string;
  domain: string;
  scope: FacadeScope;
  status: number;
  principal: FacadePrincipal;
  requestId: string;
}
const log = (): ReturnType<typeof getChildLogger> => getChildLogger("integrations.loop-lore-facade",);

/**
 * Write the audit row for one facade call.
 *
 * Best-effort BY DESIGN in this slice: facade ops delegate to
 * non-transactional service calls, so a failed audit write cannot roll the
 * op back — swallowing it silently would be worse (unaudited calls), so the
 * failure surfaces through the structured logger. The MCP slice revisits
 * this with a transactional seam.
 * @param database - Kysely handle
 * @param entry - the call facts to record
 */
export async function writeFacadeAudit(database: Kysely<DB>, entry: FacadeAuditEntry,): Promise<void> {
  // safeJsonStringify returns a Result ({ok, value}) — bind value, never the
  // envelope object itself, into the TEXT meta column. Token principals add
  // their credential attribution (id + name) so every credential-bearing
  // call is traceable to the minted token, not just the issuing admin.
  const metaResult = safeJsonStringify({
    domain: entry.domain,
    scope: entry.scope,
    principalKind: entry.principal.kind,
    status: entry.status,
    tokenId: entry.principal.credentialId,
    tokenName: entry.principal.credentialName,
    tokenScope: entry.principal.credentialScope,
  },);

  try {
    await database
      .insertInto("log_entries",)
      .values({
        ...logEntryEnvelope(6,), // 6 = INFO
        message: `facade ${entry.op} -> ${entry.status}`,
        module: "loop-lore-facade",
        event_type: "facade.op",
        action: entry.op,
        entity_type: "facade_op",
        entity_id: entry.op,
        user_id: entry.principal.userId,
        request_id: entry.requestId === "" ? null : entry.requestId,
        meta: metaResult.ok ? metaResult.value : "{}",
      },)
      .execute();
  } catch (error) {
    log()?.error(
      "facade audit row write failed",
      error instanceof Error ? error : undefined,
      { op: entry.op, },
    );
  }
}
