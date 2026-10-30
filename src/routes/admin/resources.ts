// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  addInferenceResource,
  listInferenceResources,
  revokeInferenceResource,
  testInferenceResource,
} from "../../resource/external-inference";
import {
  addStorageResource,
  listStorageResources,
  revokeStorageResource,
  testStorageResource,
  verifyBackupIntegrity,
  writeBackup,
} from "../../resource/external-storage";
import { ErrorResponse, } from "../../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  requirePermissionUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

const Kind = t.Union([t.Literal("llm",), t.Literal("sd",), t.Literal("comfyui",),],);
const StorageKind = t.Union([t.Literal("s3",), t.Literal("webdav",),],);
const QuotaBody = t.Optional(
  t.Object({ requestsPerMinute: t.Optional(t.Number(),), tokensPerMinute: t.Optional(t.Number(),), },),
);

/**
 * Admin routes for provisioned external resources.
 *
 * GET    /admin/resources/inference            — list inference endpoints
 * POST   /admin/resources/inference            — add an inference endpoint
 * DELETE /admin/resources/inference/:id       — revoke an inference endpoint
 * POST   /admin/resources/inference/:id/test  — dry-run probe (no call-out)
 * GET    /admin/resources/storage              — list storage endpoints
 * POST   /admin/resources/storage              — add a storage endpoint
 * DELETE /admin/resources/storage/:id         — revoke a storage endpoint
 * POST   /admin/resources/storage/:id/test    — dry-run probe (no call-out)
 * POST   /admin/resources/backups              — write a hash-checked backup
 * POST   /admin/resources/backups/:id/verify  — integrity check one backup
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function resourcesRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;
  return (
    new Elysia({ name: "admin-resources", },)
      // ── Inference: list ──────────────────────────────────
      .get(`${prefix}/admin/resources/inference`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        return jsonResponse({ resources: await listInferenceResources(db,), },);
      }, {
        response: { 200: t.Object({ resources: t.Array(t.Any(),), },), 403: ErrorResponse, },
      },)
      // ── Inference: add ───────────────────────────────────
      .post(`${prefix}/admin/resources/inference`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          kind: "llm" | "sd" | "comfyui";
          provider?: string;
          endpoint?: string;
          secret?: string;
          quota?: { requestsPerMinute?: number; tokensPerMinute?: number };
        };

        if (!body?.provider || !body?.endpoint || !body?.secret) {
          return jsonError({
            message: "provider, endpoint, and secret are required",
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        try {
          const quota = body.quota === undefined ? undefined : {
            requestsPerMinute: body.quota.requestsPerMinute ?? 60,
            ...(body.quota.tokensPerMinute === undefined ? {} : { tokensPerMinute: body.quota.tokensPerMinute, }),
          };

          const resource = await addInferenceResource(db, {
            ownerId: userId,
            kind: body.kind,
            provider: body.provider,
            endpoint: body.endpoint,
            secret: body.secret,
            quota,
          },);

          const { credentialRef: _credentialRef, ...publicView } = resource;
          void _credentialRef;
          return jsonResponse({ resource: publicView, }, HttpStatus.Created,);
        } catch (error) {
          return jsonError({
            message: (error as Error).message,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }
      }, {
        body: t.Object({
          kind: Kind,
          provider: t.String(),
          endpoint: t.String(),
          secret: t.String(),
          quota: QuotaBody,
        },),
        response: { 201: t.Object({ resource: t.Any(), },), 400: ErrorResponse, 403: ErrorResponse, },
      },)
      // ── Inference: revoke ────────────────────────────────
      .delete(`${prefix}/admin/resources/inference/:id`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        try {
          await revokeInferenceResource(db, ctx.params.id,);
          return jsonResponse({ revoked: ctx.params.id, },);
        } catch {
          return jsonError({
            message: `Resource "${ctx.params.id}" not found`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
      }, {
        response: { 200: t.Object({ revoked: t.String(), },), 403: ErrorResponse, 404: ErrorResponse, },
      },)
      // ── Inference: test (dry-run, never calls out) ──────
      .post(`${prefix}/admin/resources/inference/:id/test`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        return jsonResponse(await testInferenceResource(db, ctx.params.id,),);
      }, {
        response: { 200: t.Any(), 403: ErrorResponse, },
      },)
      // ── Storage: list ────────────────────────────────────
      .get(`${prefix}/admin/resources/storage`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        return jsonResponse({ resources: await listStorageResources(db,), },);
      }, {
        response: { 200: t.Object({ resources: t.Array(t.Any(),), },), 403: ErrorResponse, },
      },)
      // ── Storage: add ─────────────────────────────────────
      .post(`${prefix}/admin/resources/storage`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as {
          kind: "s3" | "webdav";
          endpoint?: string;
          secret?: string;
          storageQuotaBytes?: number;
        };

        if (!body?.endpoint || !body?.secret) {
          return jsonError({
            message: "endpoint and secret are required",
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        try {
          const resource = await addStorageResource(db, {
            ownerId: userId,
            kind: body.kind,
            endpoint: body.endpoint,
            secret: body.secret,
            storageQuotaBytes: body.storageQuotaBytes,
          },);

          const { credentialRef: _credentialRef, ...publicView } = resource;
          void _credentialRef;
          return jsonResponse({ resource: publicView, }, HttpStatus.Created,);
        } catch (error) {
          return jsonError({
            message: (error as Error).message,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }
      }, {
        body: t.Object({
          kind: StorageKind,
          endpoint: t.String(),
          secret: t.String(),
          storageQuotaBytes: t.Optional(t.Number(),),
        },),
        response: { 201: t.Object({ resource: t.Any(), },), 400: ErrorResponse, 403: ErrorResponse, },
      },)
      // ── Storage: revoke ──────────────────────────────────
      .delete(`${prefix}/admin/resources/storage/:id`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        try {
          await revokeStorageResource(db, ctx.params.id,);
          return jsonResponse({ revoked: ctx.params.id, },);
        } catch {
          return jsonError({
            message: `Resource "${ctx.params.id}" not found`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
      }, {
        response: { 200: t.Object({ revoked: t.String(), },), 403: ErrorResponse, 404: ErrorResponse, },
      },)
      // ── Storage: test (dry-run, never calls out) ─────────
      .post(`${prefix}/admin/resources/storage/:id/test`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        return jsonResponse(await testStorageResource(db, ctx.params.id,),);
      }, {
        response: { 200: t.Any(), 403: ErrorResponse, },
      },)
      // ── Backups: write (hash-checked) ─────────────────────
      .post(`${prefix}/admin/resources/backups`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as { resourceType?: string; payload?: string; storageQuotaBytes?: number };
        if (!body?.resourceType || typeof body?.payload !== "string") {
          return jsonError({
            message: "resourceType and payload are required",
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        try {
          const backup = await writeBackup(db, {
            ownerId: userId,
            resourceType: body.resourceType,
            payload: body.payload,
            storageQuotaBytes: body.storageQuotaBytes,
          },);

          return jsonResponse({ backup, }, HttpStatus.Created,);
        } catch (error) {
          if ((error as { name?: string }).name === "QuotaExceededError") {
            return jsonError({
              message: "Storage quota exceeded",
              status: HttpStatus.InsufficientStorage,
              code: ErrorCode.InsufficientStorage,
            },);
          }

          return jsonError({
            message: (error as Error).message,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }
      }, {
        body: t.Object({ resourceType: t.String(), payload: t.String(), storageQuotaBytes: t.Optional(t.Number(),), },),
        response: { 201: t.Object({ backup: t.Any(), },), 400: ErrorResponse, 403: ErrorResponse, 507: ErrorResponse, },
      },)
      // ── Backups: integrity check ─────────────────────────
      .post(`${prefix}/admin/resources/backups/:id/verify`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        try {
          const backup = await verifyBackupIntegrity(db, ctx.params.id,);
          return jsonResponse({ ok: true, backup, },);
        } catch (error) {
          if ((error as { name?: string }).name === "HashMismatchError") {
            return jsonError({
              message: (error as Error).message,
              status: HttpStatus.Conflict,
              code: ErrorCode.Conflict,
            },);
          }

          return jsonError({
            message: `Backup "${ctx.params.id}" not found`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
      }, {
        response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, },
      },)
  );
}
