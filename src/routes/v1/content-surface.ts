// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 contentSurface barrel (split out: one Elysia chain per file keeps TS2589 away).
 */
import { Elysia, } from "elysia";
import { loraRoutes, } from "../../../src/generation/lora/routes";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { assetRoutes, } from "../../assets/controller";
import { mattingRoutes, } from "../../assets/matting-routes";
import { generationRoutes, } from "../../generation/controller";
import { imageEditRoutes, } from "../../image-edit/routes";
import { personaRoutes, } from "../../personas/controller";
import { activityRoutes, } from "../activity";
import { activityStreamRoutes, } from "../activity-stream";
import { analyticsRoutes, } from "../analytics";
import { assetSearchRoutes, } from "../asset-search";
import { assetTagRoutes, } from "../asset-tags";
import { blogRoutes, } from "../blog";
import { comparisonsExportRoutes, } from "../comparisons-export";
import { generationCompareRoutes, } from "../generation/compare";
import { gifSearchRoutes, } from "../gifs/search";
import { modelComparisonsRoutes, } from "../model-comparisons";
import { notificationsRoutes, } from "../notifications";
import { nsfwRoutes, } from "../nsfw";
import { nsfwModerationRoutes, } from "../nsfw-moderation";
import { proactiveMessagingRoutes, } from "../proactive-messaging";

export function contentSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";
  return new Elysia({ name: "v1-content", },)
    // ── Generation & assets ──────────────────────────────────
    .use(generationRoutes({ database, config, }, prefix,),)
    .use(loraRoutes({ config, }, prefix,),)
    .use(assetRoutes({ database, config, }, prefix,),)
    .use(mattingRoutes({ database, config, }, prefix,),)
    .use(assetSearchRoutes(handleOpts, prefix,),)
    .use(assetTagRoutes({ database, }, prefix,),)
    .use(gifSearchRoutes(handleOpts, prefix,),)
    .use(imageEditRoutes({ database, }, prefix,),)
    // ── Social / content ─────────────────────────────────────
    .use(personaRoutes({ database, }, prefix,),)
    .use(nsfwRoutes(handleOpts, prefix,),)
    .use(nsfwModerationRoutes(handleOpts, prefix,),)
    .use(activityRoutes(handleOpts, prefix,),)
    .use(activityStreamRoutes(handleOpts, prefix,),)
    .use(notificationsRoutes(handleOpts, prefix,),)
    .use(proactiveMessagingRoutes(handleOpts, prefix,),)
    .use(blogRoutes({ database, }, prefix,),)
    .use(analyticsRoutes({ database, }, prefix,),)
    .use(modelComparisonsRoutes({ database, }, prefix,),)
    .use(comparisonsExportRoutes({ database, }, prefix,),)
    .use(generationCompareRoutes({ config, database, }, prefix,),);
}
