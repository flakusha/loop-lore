// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Advisory mesh intel feed: bounded push + delta pull over the existing mesh
 * PSK and trusted-peer guard. No block decision, no auto-apply, no caller-
 * supplied authority — delists are scoped to the authenticated peer.
 */
import type { Elysia, } from "elysia";
import {
  intelMaterial,
  intelPullMaterial,
  MAX_PER_PEER,
  parseIntelFeed,
  verifyIntelProof,
} from "../honeypot/intel";
import {
  countActiveForPeer,
  delistIntelForPeer,
  listActiveIntel,
  pruneExpiredIntel,
  recordIntel,
} from "../honeypot/intel-store";
import { getLogger, } from "../logger";
import { toDate, } from "../utils/date";
import { authorizeMeshPeer, type MeshRouteOpts, } from "./federation-mesh";
import { ErrorCode, HttpStatus, type HttpStatusCode, jsonError, jsonResponse, } from "./http-utils";

/** Kill switch: `HONEYPOT_MESH_INTEL=0` leaves the feed unmounted. */
export function meshIntelEnabled(env: NodeJS.ProcessEnv = process.env,): boolean {
  return env.HONEYPOT_MESH_INTEL !== "0";
}

/**
 * @param message
 * @param status
 * @param code
 * @returns JSON error response
 */
function error(message: string, status: HttpStatusCode, code: ErrorCode,): Response {
  return jsonError({ code, message, status, },);
}

/**
 * @param action
 * @param indicator
 * @param origin
 */
function audit(action: string, indicator: string, origin: string,): void {
  try {
    getLogger().info("mesh intel advisory", {
      action,
      indicator,
      module: "honeypot",
      sourcePeer: origin,
    },);
  } catch {
    // Logger may be uninitialised in unit tests; the row is already stored.
  }
}

/**
 * Mount peer-authenticated intel push/pull on a federation app.
 * @param app Elysia app under construction.
 * @param opts config + database supplied by the federation mount.
 * @returns void
 */
export function mountMeshIntelApi(app: Elysia, opts: MeshRouteOpts,): void {
  const { config, database, } = opts;

  app.post("/api/mesh/intel/push", async ({ body, },) => {
    const parsed = parseIntelFeed(body,);
    if (!parsed.ok) { return error(parsed.error, HttpStatus.BadRequest, ErrorCode.BadRequest,); }

    const authorized = await authorizeMeshPeer(database, parsed.feed.origin,);
    if (authorized instanceof Response) { return authorized; }
    const origin = authorized.origin;

    const secret = config.federation.meshPsk;
    if (!secret) {
      return error(
        "mesh sharing not configured (MESH_PSK unset)",
        HttpStatus.ServiceUnavailable,
        ErrorCode.ServiceUnavailable,
      );
    }

    if (!await verifyIntelProof(secret, intelMaterial(parsed.feed,), parsed.proof,)) {
      return error("invalid intel proof", HttpStatus.BadRequest, ErrorCode.BadRequest,);
    }

    if (parsed.feed.records.some((record,) => record.sourcePeer !== origin)) {
      return error("source peer mismatch", HttpStatus.BadRequest, ErrorCode.BadRequest,);
    }

    const now = new Date();
    await pruneExpiredIntel(database, now,);
    const active = await countActiveForPeer(database, origin, now,);
    const reports = parsed.feed.records.filter((record,) => record.action === "report");
    if (active + reports.length > MAX_PER_PEER) {
      return error("peer intel budget exhausted", HttpStatus.TooManyRequests, ErrorCode.TooManyRequests,);
    }

    let accepted = 0;
    let delisted = 0;
    let duplicates = 0;
    for (const record of parsed.feed.records) {
      if (record.action === "delist") {
        delisted += await delistIntelForPeer(database, record.indicator, origin,);
      } else if (await recordIntel(database, record, now,)) {
        accepted += 1;
      } else {
        duplicates += 1;
      }

      audit(record.action, record.indicator, origin,);
    }

    return jsonResponse({ accepted, delisted, duplicates, },);
  },);

  app.post("/api/mesh/intel/pull", async ({ body, },) => {
    const request = body as { origin?: unknown; proof?: unknown; since?: unknown } | null;
    if (
      !request || typeof request.origin !== "string" ||
      typeof request.proof !== "string" || request.proof.length !== 64 ||
      (request.since !== undefined && typeof request.since !== "string")
    ) { return error("invalid pull request", HttpStatus.BadRequest, ErrorCode.BadRequest,); }

    const authorized = await authorizeMeshPeer(database, request.origin,);
    if (authorized instanceof Response) { return authorized; }
    const origin = authorized.origin;

    const secret = config.federation.meshPsk;
    if (!secret) {
      return error(
        "mesh sharing not configured (MESH_PSK unset)",
        HttpStatus.ServiceUnavailable,
        ErrorCode.ServiceUnavailable,
      );
    }

    const since = typeof request.since === "string" ? toDate(request.since,) : undefined;
    if (since && Number.isNaN(since.getTime(),)) {
      return error("invalid cursor", HttpStatus.BadRequest, ErrorCode.BadRequest,);
    }

    if (
      !await verifyIntelProof(
        secret,
        intelPullMaterial(origin, since?.toISOString(),),
        request.proof,
      )
    ) { return error("invalid intel proof", HttpStatus.BadRequest, ErrorCode.BadRequest,); }

    const records = await listActiveIntel(database, { since, },);
    return jsonResponse({ cursor: new Date().toISOString(), records, },);
  },);
}
