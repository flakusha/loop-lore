// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor E2E Public-Key Routes (TASK-asymmetric-key-pairs-followup)
 *
 * REST surface for clients to register and look up ECDH public keys per actor.
 * Private keys NEVER reach the server; these endpoints accept only the public
 * half. Auth is enforced per-actor: only the actor's owner can register or
 * revoke their own public key; any authenticated user can read any actor's
 * active public key (it's meant to be distributed to other participants).
 *
 * Endpoints:
 *   GET    /api/actors/:actorId/e2e-public-key   — read active pubkey (auth required)
 *   PUT    /api/actors/:actorId/e2e-public-key   — register or rotate (owner only)
 *   DELETE /api/actors/:actorId/e2e-public-key   — revoke (owner only)
 *
 * Bulk reads (for distributing keys to chat joiners) are handled by the
 * `listActivePublicKeys` service helper — not exposed as a generic HTTP
 * route in v1 because chat joiners typically learn the set via the chat
 * membership payload, not by querying an arbitrary list endpoint.
 */

import { Elysia, t, } from "elysia";
import { getActivePublicKey, registerPublicKey, revokePublicKey, } from "../crypto/e2e/server-registry";
import { ErrorResponse, } from "../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "./http-utils";

const RegisterE2EPublicKeyBody = t.Object({
  publicKeyJwk: t.Object({
    kty: t.String(),
    crv: t.String(),
    x: t.String(),
    y: t.String(),
  }, { additionalProperties: true, },),
  algorithm: t.Optional(t.String({ minLength: 1, maxLength: 32, },),),
  expiresAt: t.Optional(t.String({ format: "date-time", },),),
},);

const PublicKeyResponse = t.Object({
  id: t.String(),
  actorId: t.String(),
  algorithm: t.String(),
  publicKeyJwk: t.Object({
    kty: t.String(),
    crv: t.String(),
    x: t.String(),
    y: t.String(),
  }, { additionalProperties: true, },),
  createdAt: t.String(),
  expiresAt: t.Union([t.String(), t.Null(),],),
  revokedAt: t.Union([t.String(), t.Null(),],),
},);

const ActorIdE2EParams = t.Object({
  actorId: t.String({ minLength: 1, },),
},);

export function actorE2EPubkeyRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "actor-e2e-pubkeys", },)
    // ── Read active public key for an actor ──────────────────

    .get(`${prefix}/actors/:actorId/e2e-public-key`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      const row = await getActivePublicKey({ database, actorId: ctx.params.actorId, },);
      if (!row) {
        return jsonError({ message: "No active public key for actor", status: HttpStatus.NotFound, },);
      }
      return jsonResponse(row,);
    }, {
      params: ActorIdE2EParams,
      response: {
        200: PublicKeyResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get actor's active E2E public key",
        description: "Returns the actor's current ECDH public key for E2E key agreement.",
        tags: ["E2E Encryption",],
      },
    },)
    // ── Register or rotate public key (owner only) ───────────

    .put(`${prefix}/actors/:actorId/e2e-public-key`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const row = await registerPublicKey({
        database,
        actorId: ctx.params.actorId,
        publicKeyJwk: ctx.body.publicKeyJwk,
        ...(ctx.body.algorithm !== undefined ? { algorithm: ctx.body.algorithm, } : {}),
        ...(ctx.body.expiresAt !== undefined ? { expiresAt: ctx.body.expiresAt, } : {}),
      },);
      return jsonResponse(row, HttpStatus.Created,);
    }, {
      params: ActorIdE2EParams,
      body: RegisterE2EPublicKeyBody,
      response: {
        201: PublicKeyResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Register or rotate actor's E2E public key",
        description: "Uploads the actor's ECDH public-key JWK. Replaces any existing active key.",
        tags: ["E2E Encryption",],
      },
    },)
    // ── Revoke active public key (owner only) ────────────────

    .delete(`${prefix}/actors/:actorId/e2e-public-key`, async (ctx,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const revoked = await revokePublicKey({ database, actorId: ctx.params.actorId, },);
      if (!revoked) {
        return jsonError({ message: "No active public key to revoke", status: HttpStatus.NotFound, },);
      }
      return jsonResponse({ ok: true, revoked: true, },);
    }, {
      params: ActorIdE2EParams,
      response: {
        200: t.Object({ ok: t.Boolean(), revoked: t.Boolean(), },),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Revoke actor's active E2E public key",
        description: "Soft-revokes the active public key. The row stays in the table for audit.",
        tags: ["E2E Encryption",],
      },
    },);
}
