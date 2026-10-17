// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 250

/**
 * World licensing routes (063).
 *
 * World-scoped per repo convention: `/api/v1/worlds/:worldId/license`.
 * Reads go through `requireWorldAccess`, writes through `requireWorldOwner`,
 * and the envelope is the same `jsonResponse` / `jsonError` pair every other
 * worlds route uses.
 */
import { Elysia, t, } from "elysia";
import { LicenseKind, UseFlag, } from "../../db/enums-story";
import { ErrorResponse, } from "../../validation/schemas";
import {
  getWorldLicense,
  LicenseError,
  LicenseViolationError,
  setWorldLicense,
  toLicenseManifest,
  USE_FLAGS,
  validateImportLicense,
} from "../../worlds/license";
import type { LicenseInput, UseFlag as UseFlagType, } from "../../worlds/license";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** `t.UnionEnum` needs a non-empty TUPLE; `Object.values` widens to a plain
 * array. One cast per enum keeps the vocabulary single-sourced. */
const LICENSE_KINDS = Object.values(LicenseKind,) as [LicenseKind, ...LicenseKind[],];
const USE_FLAGS_WIRE = Object.values(UseFlag,) as [UseFlag, ...UseFlag[],];

/** A license as exposed over the wire. */
const LicenseSchema = t.Object({
  worldId: t.String(),
  kind: t.UnionEnum(LICENSE_KINDS,),
  spdxId: t.Union([t.String(), t.Null(),],),
  licenseText: t.Union([t.String(), t.Null(),],),
  attribution: t.Object({
    author: t.Optional(t.String(),),
    url: t.Optional(t.String(),),
    notice: t.Optional(t.String(),),
  },),
  allowedUse: t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),
  prohibitedUse: t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),
},);

/** The use flags the vocabulary defines. */
const UseFlagsResponse = {
  200: t.Object({ data: t.Array(t.String(),), },),
};

/** Body accepted when creating or replacing a license. */
const LicenseBody = t.Object({
  spdxId: t.Optional(t.Union([t.String(), t.Null(),],),),
  licenseText: t.Optional(t.Union([t.String(), t.Null(),],),),
  attribution: t.Optional(t.Object({
    author: t.Optional(t.String(),),
    url: t.Optional(t.String(),),
    notice: t.Optional(t.String(),),
  },),),
  allowedUse: t.Optional(t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),),
  prohibitedUse: t.Optional(t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),),
},);

/** Body accepted by the import-preflight POST. */
const ValidateImportBody = t.Object({
  declaredProhibitedUse: t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),
},);

/** Response of the import-preflight POST. */
const ValidateImportResponse = {
  200: t.Union([
    t.Object({ ok: t.Literal(true,), },),
    t.Object({ ok: t.Literal(false,), violations: t.Array(t.String(),), },),
  ],),
  401: ErrorResponse,
  404: ErrorResponse,
};

/**
 * Build an Elysia beforeHandle gate from one world-permission check.
 * @param database Kysely handle
 * @param require the access or owner check to apply
 * @returns a hook returning the short-circuit Response, or undefined
 */
function gate(
  database: HandleOpts["database"],
  require: typeof requireWorldOwner,
): (ctx: any,) => Promise<any> {
  return async (ctx: any,) => {
    const { userId, userRole, } = extractAuth(ctx,);
    const err = await require(database, ctx.params.worldId as string, userId, userRole,);
    return err ?? undefined;
  };
}

/**
 * Map a thrown service error onto the shared worlds envelope.
 * @param error the thrown value
 * @returns the mapped Response
 * @throws {unknown} rethrows anything that is not a license error
 */
function licenseErrorResponse(error: unknown,): Response {
  if (error instanceof LicenseViolationError) {
    return jsonError({ message: error.message, status: HttpStatus.Forbidden, },);
  }

  if (error instanceof LicenseError) {
    return jsonError({ message: error.message, status: HttpStatus.BadRequest, },);
  }

  throw error;
}

/**
 * World license routes: read, replace, export manifest, and import preflight.
 * @param opts handler options carrying the DB handle
 * @param prefix route prefix
 * @returns {Elysia} the license routes plugin
 */
export function worldLicenseRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const ownerGate = gate(database, requireWorldOwner,);
  const accessGate = gate(database, requireWorldAccess,);

  return new Elysia({ name: "worlds-license", },)
    .get(
      `${prefix}/worlds/:worldId/license`,
      async (ctx: any,) => {
        const license = await getWorldLicense(database, ctx.params.worldId as string,);
        if (!license) {
          return jsonError({ message: "World has no license", status: HttpStatus.NotFound, },);
        }

        return jsonResponse(license,);
      },
      {
        beforeHandle: [accessGate,],
        response: { 200: LicenseSchema, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Read world license",
          description: "The world's shareability terms: SPDX id or custom text, attribution, and use flags.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      `${prefix}/worlds/:worldId/license`,
      async (ctx: any,) => {
        try {
          const input = ctx.body as LicenseInput;
          const license = await setWorldLicense(database, ctx.params.worldId as string, input,);
          return jsonResponse(license,);
        } catch (error) {
          return licenseErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: LicenseBody,
        response: { 200: LicenseSchema, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
        detail: {
          summary: "Replace world license",
          description: "Set the world's license. Provide exactly one of spdxId or licenseText. Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/license/manifest`,
      async (ctx: any,) => {
        const license = await getWorldLicense(database, ctx.params.worldId as string,);
        if (!license) {
          return jsonError({ message: "World has no license", status: HttpStatus.NotFound, },);
        }

        return jsonResponse(toLicenseManifest({ license, },),);
      },
      {
        beforeHandle: [accessGate,],
        response: {
          200: t.Object({
            world_id: t.String(),
            spdx_or_custom: t.UnionEnum(LICENSE_KINDS,),
            spdx_id: t.Union([t.String(), t.Null(),],),
            license_text: t.Union([t.String(), t.Null(),],),
            attribution: t.Object({
              author: t.Optional(t.String(),),
              url: t.Optional(t.String(),),
              notice: t.Optional(t.String(),),
            },),
            allowed_use: t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),
            prohibited_use: t.Array(t.UnionEnum(USE_FLAGS_WIRE,),),
          },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "License manifest",
          description: "The license block as embedded in an export bundle.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/license/validate-import`,
      async (ctx: any,) => {
        const license = await getWorldLicense(database, ctx.params.worldId as string,);
        if (!license) {
          return jsonError({ message: "World has no license", status: HttpStatus.NotFound, },);
        }

        const { declaredProhibitedUse, } = ctx.body as { declaredProhibitedUse: UseFlagType[] };
        return jsonResponse(validateImportLicense({ license, declaredProhibitedUse, },),);
      },
      {
        beforeHandle: [accessGate,],
        body: ValidateImportBody,
        response: ValidateImportResponse,
        detail: {
          summary: "Validate an import against the license",
          description: "Reports whether a declared set of uses is permitted. Never mutates anything.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/license/use-flags`,
      () => jsonResponse({ data: USE_FLAGS, },),
      {
        beforeHandle: [accessGate,],
        response: UseFlagsResponse,
        detail: {
          summary: "List use flags",
          description: "Every use flag the license vocabulary defines.",
          tags: ["Worlds",],
        },
      },
    );
}
