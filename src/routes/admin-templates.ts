/**
 * Admin Template Management Routes
 *
 * CRUD for prompt template profiles used in image generation.
 * Templates define how the LLM generates image prompts for
 * different model families and detail levels.
 *
 *   GET    /api/admin/templates             — list all profiles
 *   GET    /api/admin/templates/:id         — get one profile
 *   GET    /api/admin/templates/registry    — get full registry
 *   PUT    /api/admin/templates/:id         — update template text
 *   PUT    /api/admin/templates/:id/defaults — update model defaults
 *   POST   /api/admin/templates             — create custom profile
 *   DELETE /api/admin/templates/:id         — delete custom profile
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { getConfig, setConfig, } from "../admin/config";
import type { DB, } from "../db/schema";
import {
  BUILTIN_PROFILES,
  DEFAULT_PROFILE_REGISTRY,
  type DetailLevel,
  type ImageModelProfile,
  type SdGenMode,
} from "../generation/prompt-templates";
import { getLogger, type Logger, } from "../logger";
import { jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "admin-templates", },);
}

/** JSON key for storing custom templates in system_config */
const TEMPLATES_KEY = "prompt_templates";

/** Stored custom profiles (JSON in system_config) */
interface StoredTemplates {
  profiles: Record<string, ImageModelProfile>;
  defaultProfileId: string;
}

async function loadStoredTemplates(db: Kysely<DB>,): Promise<StoredTemplates> {
  const raw = await getConfig(db, TEMPLATES_KEY,);
  if (!raw) {
    return { profiles: {}, defaultProfileId: "sdxl", };
  }
  try {
    return JSON.parse(raw.value,) as StoredTemplates;
  } catch {
    log().warn("Failed to parse stored templates, resetting",);
    return { profiles: {}, defaultProfileId: "sdxl", };
  }
}

async function saveStoredTemplates(db: Kysely<DB>, data: StoredTemplates,): Promise<void> {
  await setConfig(db, TEMPLATES_KEY, JSON.stringify(data,), "Custom prompt template profiles",);
}

function mergeProfiles(
  builtin: Record<string, ImageModelProfile>,
  custom: Record<string, ImageModelProfile>,
): Record<string, ImageModelProfile> {
  return { ...builtin, ...custom, };
}

export function adminTemplateRoutes(opts: { database: Kysely<DB> },) {
  const { database, } = opts;
  return new Elysia({ name: "admin-templates", },)
    // ── List all profiles (builtin + custom) ───────────────
    .get("/api/admin/templates", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      try {
        const stored = await loadStoredTemplates(database,);
        const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);

        const profiles = Object.values(merged,).map((p,) => ({
          id: p.id,
          name: p.name,
          families: p.families,
          promptFormat: p.promptFormat,
          maxTokenHint: p.maxTokenHint,
          defaults: p.defaults,
          isBuiltin: p.id in BUILTIN_PROFILES,
          templateCount: countTemplates(p.templates,),
        }));

        return jsonResponse({
          profiles,
          defaultProfileId: stored.defaultProfileId,
          builtinCount: Object.keys(BUILTIN_PROFILES,).length,
          customCount: Object.keys(stored.profiles,).length,
        },);
      } catch (error) {
        log().error(`Failed to list templates: ${String(error,)}`,);
        return jsonError({
          message: ctx.t?.("admin.templateListFailed",) ?? "Failed to list templates",
          status: HttpStatus.InternalServerError,
        },);
      }
    },)
    // ── Get full registry (all profiles with templates) ────
    .get("/api/admin/templates/registry", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
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
          message: ctx.t?.("admin.templateRegistryFailed",) ?? "Failed to get registry",
          status: HttpStatus.InternalServerError,
        },);
      }
    },)
    // ── Get one profile ───────────────────────────────────
    .get("/api/admin/templates/:id", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { id, } = ctx.params as { id: string };
      const stored = await loadStoredTemplates(database,);
      const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);
      const profile = merged[id];

      if (!profile) {
        return jsonError({
          message: ctx.t?.("characters.profileNotFound",) ?? "Profile not found",
          status: HttpStatus.NotFound,
        },);
      }

      return jsonResponse({
        ...profile,
        isBuiltin: id in BUILTIN_PROFILES,
      },);
    },)
    // ── Update template text for a profile ────────────────
    .put(
      "/api/admin/templates/:id",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError({
            message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
            status: HttpStatus.Unauthorized,
          },);
        }

        const { id, } = ctx.params as { id: string };
        const body = ctx.body as {
          detail?: DetailLevel;
          mode?: SdGenMode;
          template?: string;
        };

        if (!body.detail || !body.mode || !body.template) {
          return jsonError({
            message: "detail, mode, and template are required",
            status: HttpStatus.BadRequest,
          },);
        }

        const stored = await loadStoredTemplates(database,);
        const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);
        const existing = merged[id];

        if (!existing) {
          return jsonError({
            message: ctx.t?.("characters.profileNotFound",) ?? "Profile not found",
            status: HttpStatus.NotFound,
          },);
        }

        // Deep clone the profile
        const updated = structuredClone(existing,);

        // Ensure template structure exists
        if (!updated.templates) {
          updated.templates = {} as Record<DetailLevel, any>;
        }
        if (!updated.templates[body.detail]) {
          (updated.templates as any)[body.detail] = {};
        }
        (updated.templates as any)[body.detail][body.mode] = body.template;

        // Store as custom (even for builtin overrides)
        stored.profiles[id] = updated;
        await saveStoredTemplates(database, stored,);

        log().info(`Template updated: ${id}/${body.detail}/${body.mode}`,);
        return jsonResponse({ ok: true, profileId: id, },);
      },
    )
    // ── Update model defaults for a profile ───────────────
    .put(
      "/api/admin/templates/:id/defaults",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError({
            message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
            status: HttpStatus.Unauthorized,
          },);
        }

        const { id, } = ctx.params as { id: string };
        const body = ctx.body as {
          cfgScale?: number;
          steps?: number;
          sampler?: string;
          scheduler?: string;
          clipSkip?: number;
          maxTokenHint?: number;
        };

        const stored = await loadStoredTemplates(database,);
        const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);
        const existing = merged[id];

        if (!existing) {
          return jsonError({
            message: ctx.t?.("characters.profileNotFound",) ?? "Profile not found",
            status: HttpStatus.NotFound,
          },);
        }

        const updated = structuredClone(existing,);

        if (body.cfgScale !== undefined) { updated.defaults.cfgScale = body.cfgScale; }
        if (body.steps !== undefined) { updated.defaults.steps = body.steps; }
        if (body.sampler !== undefined) { updated.defaults.sampler = body.sampler; }
        if (body.scheduler !== undefined) { updated.defaults.scheduler = body.scheduler; }
        if (body.clipSkip !== undefined) { updated.defaults.clipSkip = body.clipSkip; }
        if (body.maxTokenHint !== undefined) { updated.maxTokenHint = body.maxTokenHint; }

        stored.profiles[id] = updated;
        await saveStoredTemplates(database, stored,);

        log().info(`Model defaults updated: ${id}`,);
        return jsonResponse({ ok: true, profileId: id, },);
      },
    )
    // ── Create custom profile ─────────────────────────────
    .post(
      "/api/admin/templates",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError({
            message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
            status: HttpStatus.Unauthorized,
          },);
        }

        const body = ctx.body as {
          id: string;
          name: string;
          families: string[];
          promptFormat?: string;
          maxTokenHint?: number;
          defaults?: {
            cfgScale: number;
            steps: number;
            sampler: string;
            scheduler?: string;
          };
        };

        if (!body.id || !body.name || !body.families?.length) {
          return jsonError({
            message: "id, name, and families are required",
            status: HttpStatus.BadRequest,
          },);
        }

        // Validate ID format
        if (!/^[a-z0-9_-]+$/.test(body.id,)) {
          return jsonError({
            message: "Profile ID must be lowercase alphanumeric with hyphens/underscores",
            status: HttpStatus.BadRequest,
          },);
        }

        const stored = await loadStoredTemplates(database,);
        const merged = mergeProfiles(BUILTIN_PROFILES, stored.profiles,);

        if (merged[body.id]) {
          return jsonError({
            message: `Profile '${body.id}' already exists`,
            status: HttpStatus.UnprocessableEntity,
          },);
        }

        const newProfile: ImageModelProfile = {
          id: body.id,
          name: body.name,
          families: body.families as any,
          promptFormat: (body.promptFormat ?? "tags") as any,
          maxTokenHint: body.maxTokenHint ?? 150,
          defaults: {
            cfgScale: body.defaults?.cfgScale ?? 7,
            steps: body.defaults?.steps ?? 28,
            sampler: body.defaults?.sampler ?? "euler_a",
            scheduler: body.defaults?.scheduler ?? "karras",
          },
          templates: {
            instant: { yourself: "", face: "", me: "", scene: "", last: "", background: "", },
            balanced: { yourself: "", face: "", me: "", scene: "", last: "", background: "", },
            detailed: { yourself: "", face: "", me: "", scene: "", last: "", background: "", },
          },
        };

        stored.profiles[body.id] = newProfile;
        await saveStoredTemplates(database, stored,);

        log().info(`Custom profile created: ${body.id}`,);
        return jsonResponse({ ok: true, profileId: body.id, },);
      },
    )
    // ── Delete custom profile ─────────────────────────────
    .delete(
      "/api/admin/templates/:id",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return jsonError({
            message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
            status: HttpStatus.Unauthorized,
          },);
        }

        const { id, } = ctx.params as { id: string };

        if (id in BUILTIN_PROFILES) {
          return jsonError({
            message: "Cannot delete builtin profiles",
            status: HttpStatus.BadRequest,
          },);
        }

        const stored = await loadStoredTemplates(database,);

        if (!stored.profiles[id]) {
          return jsonError({
            message: ctx.t?.("characters.profileNotFound",) ?? "Profile not found",
            status: HttpStatus.NotFound,
          },);
        }

        const { [id]: _, ...rest } = stored.profiles;
        stored.profiles = rest;
        await saveStoredTemplates(database, stored,);

        log().info(`Custom profile deleted: ${id}`,);
        return jsonResponse({ ok: true, },);
      },
    );
}

/** Count total templates across all detail levels and modes */
function countTemplates(templates: ImageModelProfile["templates"],): number {
  let count = 0;
  const templateValues = Object.values(templates ?? {},);
  for (const detail of templateValues) {
    count += Object.values(detail,).filter((t,) => t.length > 0).length;
  }
  return count;
}
