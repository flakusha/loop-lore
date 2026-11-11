// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound/principal.ts — the inbound stdio transports' server-resolved
 * principal (epic-agentic-integration-mcp-acp §3.3).
 *
 * The HTTP facade mints its principal ONLY from an authenticated
 * RequestContext (`facadeContextFromRequestContext`); stdio has no request,
 * so the operator names the principal in `integrations.inbound` and the
 * admin override layer. This module is the single assertion point for the
 * stdio side: it reads the EFFECTIVE inbound settings and fails closed —
 * disabled server, unseeded store, or an empty principal userId yields no
 * context at all, and a scope outside the vocabulary narrows to a denial
 * downstream (`authorizeFacadeOp` denies null/unreadable scopes).
 *
 * The principal kind is `external-agent` with the configured tier, so the
 * facade's token-tier ladder applies unchanged: a `read` principal is
 * denied every chat-write op with a typed 403-class result, and budgets
 * key on the configured userId.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { FacadeContext, FacadeScope, } from "../loop-lore-facade/types";
import { getInboundSettings, type InboundSettingsView, isInboundSettingsSeeded, } from "./settings";

/** Which inbound transport is asking — audit/attribute metadata. */
export type InboundTransport = "mcp-stdio" | "acp-stdio";

/** All inbound transports (the §3.3 surface). */
export const INBOUND_TRANSPORTS = ["mcp-stdio", "acp-stdio",] as const;

/**
 * Resolve the inbound transport's facade context from the effective
 * settings. Fail-closed: `null` means "refuse the connection" — the caller
 * must not fabricate a context of its own.
 * @param database - Kysely handle the ops run against
 * @param config - app config (handlers receive it like every facade op)
 * @param transport - which inbound transport is connecting
 * @param requestId - stable id for audit rows (one per connection request)
 * @returns {FacadeContext | null} the context, or null when denied
 */
export function buildInboundFacadeContext(
  database: Kysely<DB>,
  config: Config,
  transport: InboundTransport,
  requestId: string,
): FacadeContext | null {
  const settings = effectiveInboundSettings(transport,);
  if (settings === null) { return null; }

  return {
    database,
    config,
    requestId,
    principal: {
      kind: "external-agent",
      userId: settings.principalUserId,
      userRole: null,
      credentialId: null,
      credentialName: `inbound-${transport}`,
      // The configured tier rides the credentialScope slot so the facade's
      // cumulative tier ladder authorizes exactly as it does for tokens.
      credentialScope: settings.principalScope as FacadeScope,
    },
  };
}

/**
 * Effective settings for one transport, or null when that transport must
 * be refused: unseeded store, disabled server, or empty principal userId.
 * @param transport - which inbound transport is connecting
 * @returns {InboundSettingsView | null} the settings, or the refusal
 */
export function effectiveInboundSettings(transport: InboundTransport,): InboundSettingsView | null {
  if (!isInboundSettingsSeeded()) { return null; }

  const settings = getInboundSettings();
  const enabled = transport === "mcp-stdio" ? settings.mcpEnabled : settings.acpEnabled;
  if (!enabled || settings.principalUserId === "") { return null; }

  return settings;
}
