import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  BUILTIN_PROFILES,
  DEFAULT_PROFILE_REGISTRY,
} from "../../generation/prompt-templates";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { countTemplates, loadStoredTemplates, log, mergeProfiles, } from "./shared";

export function listRoutes(opts: { database: Kysely<DB> }, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-templates-list", },)
      // ── List all profiles (builtin + custom) ───────────────
      .get(prefix + "/admin/templates", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        if (!isAdminRole(ctx.userRole as string | null,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        try {
          const stored = await loadStoredTemplates(database,);
          const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);

          const profiles = Array.from(Object.values(merged,), (p,) => ({
            id: p.id,
            name: p.name,
            families: p.families,
            promptFormat: p.promptFormat,
            maxTokenHint: p.maxTokenHint,
            defaults: p.defaults,
            isBuiltin: p.id in BUILTIN_PROFILES,
            templateCount: countTemplates(p.templates,),
          }),);

          return jsonResponse({
            profiles,
            defaultProfileId: stored.defaultProfileId,
            builtinCount: Object.keys(BUILTIN_PROFILES,).length,
            customCount: Object.keys(stored.profiles,).length,
          },);
        } catch (error) {
          log().error(`Failed to list templates: ${String(error,)}`,);
          return jsonError({
            message: "Failed to list templates",
            status: HttpStatus.InternalServerError,
          },);
        }
      },)
      // ── Get full registry (all profiles with templates) ────
      .get(prefix + "/admin/templates/registry", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        if (!isAdminRole(ctx.userRole as string | null,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        try {
          const stored = await loadStoredTemplates(database,);
          const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);

          return jsonResponse({
            profiles: merged,
            defaultProfileId: stored.defaultProfileId,
            modelMatching: DEFAULT_PROFILE_REGISTRY.modelMatching,
          },);
        } catch (error) {
          log().error(`Failed to get registry: ${String(error,)}`,);
          return jsonError({
            message: "Failed to get registry",
            status: HttpStatus.InternalServerError,
          },);
        }
      },)
      // ── Get one profile ───────────────────────────────────
      .get(prefix + "/admin/templates/:id", async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        if (!isAdminRole(ctx.userRole as string | null,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const { id, } = ctx.params as { id: string };
        const stored = await loadStoredTemplates(database,);
        const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);
        const profile = merged[id];

        if (!profile) {
          return jsonError({ message: "Profile not found", status: HttpStatus.NotFound, },);
        }

        return jsonResponse({
          ...profile,
          isBuiltin: id in BUILTIN_PROFILES,
        },);
      },)
  );
}
