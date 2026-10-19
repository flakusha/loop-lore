// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer CRUD endpoints for the federation admin panel.
 *
 * The save path itself lives in `./federation-peer-save` (it owns the write
 * contract, this module owns the HTTP surface). Validation is delegated
 * wholesale to `validatePeerWorkloadSave` so the route and the registry store
 * can never disagree about what a valid peer is: a non-http(s) origin, a
 * loopback origin without a token, a token on a remote origin, a class outside
 * the enum and a duplicate origin are ALL rejected by the shared validator, not
 * re-implemented here.
 *
 * The shared token is WRITE-ONLY. It is accepted on save, handed straight to
 * `savePeerWorkload` for encryption, and never placed in a response, an audit
 * `meta` blob, or a log line. `WorkloadPeer` exposes only `hasSharedToken`.
 *
 * A save runs a live probe: a peer that cannot answer `/api/instance-state` is
 * stored `pending`, never `trusted`, and the operator is told why.
 */

import { Elysia, t, } from "elysia";
import { PEER_WORKLOAD_CLASSES, } from "../../db/enums";
import { revokeDekExportsForPeer, } from "../../federation/dek-rewrap";
import { canonicalOrigin, } from "../../federation/peer-fetch";
import { revokeInboundKey, } from "../../federation/peer-keys";
import {
  listWorkloadPeers,
  PeerWorkloadValidationError,
  setAllowedWorkloadClasses,
  setWorkloadTrust,
} from "../../federation/peer-registry";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import {
  AdminFederationPeerBody,
  AdminFederationWorkloadBody,
} from "../../validation/schemas/admin-federation";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, withPermissionAuth, } from "../http-utils";
import { savePeer, } from "./federation-peer-save";
import {
  auditFederationChange,
  badOriginResponse,
  federationOffResponse,
  isWorkloadClass,
  notInEnumResponse,
} from "./federation-shared";
import type { AdminFederationRouteOpts, } from "./federation-types";

/**
 * Peer CRUD endpoints. Every route gates on the EXISTING `admin.system`
 * permission — this epic deliberately adds no `federation.*` string.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function federationPeersRoutes(opts: AdminFederationRouteOpts, prefix = "/api",) {
  const db = opts.database;
  return new Elysia({ name: "admin-federation-peers", },)
    .get(`${prefix}/admin/federation/peers`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async () => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        return jsonResponse({ peers: await listWorkloadPeers(db,), },);
      },);
    }, { response: { 200: t.Any(), 403: ErrorResponse, 503: ErrorResponse, }, },)
    .post(`${prefix}/admin/federation/peers`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        return await savePeer(opts, actorId, ctx.body,);
      },);
    }, {
      body: AdminFederationPeerBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 503: ErrorResponse, },
    },)
    .patch(`${prefix}/admin/federation/peers/:origin/workload`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        const origin = canonicalOrigin(ctx.params.origin,);
        if (origin === null) { return badOriginResponse(); }

        if ((await listWorkloadPeers(db,)).every((peer,) => peer.origin !== origin)) {
          return jsonError({
            message: `unknown peer: ${origin}`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        for (const entry of ctx.body.allowedWorkloadClasses ?? []) {
          if (!isWorkloadClass(entry,)) {
            return notInEnumResponse("allowedWorkloadClasses", entry, PEER_WORKLOAD_CLASSES,);
          }
        }

        try {
          if (ctx.body.workloadTrust !== undefined) {
            await setWorkloadTrust(db, { origin, workloadTrust: ctx.body.workloadTrust, },);
          }

          if (ctx.body.allowedWorkloadClasses !== undefined) {
            await setAllowedWorkloadClasses(db, {
              origin,
              classes: ctx.body.allowedWorkloadClasses.filter(isWorkloadClass,),
            },);
          }

          if (ctx.body.stickyEnabled !== undefined) {
            await db.updateTable("mesh_peers",).set({ sticky_enabled: ctx.body.stickyEnabled, },).where(
              "origin",
              "=",
              origin,
            ).execute();
          }
        } catch (error) {
          if (error instanceof PeerWorkloadValidationError) {
            return jsonError({
              message: error.message,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
              data: { reason: error.reason, },
            },);
          }

          throw error;
        }

        const peer = (await listWorkloadPeers(db,)).find((entry,) => entry.origin === origin);
        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.peer_workload_updated",
          action: "peer_workload_update",
          entityType: "mesh_peer",
          entityId: origin,
          message: `Peer workload policy updated: ${origin}`,
          meta: { origin, workloadTrust: peer?.workloadTrust, allowedWorkloadClasses: peer?.allowedWorkloadClasses, },
        },);

        return jsonResponse({ peer, },);
      },);
    }, {
      body: AdminFederationWorkloadBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        503: ErrorResponse,
      },
    },)
    .delete(`${prefix}/admin/federation/peers/:origin`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        const origin = canonicalOrigin(ctx.params.origin,);
        if (origin === null) { return badOriginResponse(); }

        if ((await listWorkloadPeers(db,)).every((peer,) => peer.origin !== origin)) {
          return jsonError({
            message: `unknown peer: ${origin}`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        // Revocations first and idempotent: a half-deleted peer that kept its
        // inbound key could still be handed content by a sender that holds it.
        await revokeInboundKey(db, origin,);
        const revokedDekExports = await revokeDekExportsForPeer(db, origin,);
        await db.deleteFrom("mesh_peers",).where("origin", "=", origin,).execute();

        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.peer_removed",
          action: "peer_remove",
          entityType: "mesh_peer",
          entityId: origin,
          message: `Peer removed: ${origin}`,
          meta: { origin, revokedDekExports, },
        },);

        return jsonResponse({ ok: true, origin, revokedDekExports, },);
      },);
    }, {
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        503: ErrorResponse,
      },
    },);
}
