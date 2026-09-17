// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 baseSurface barrel (split out: one Elysia chain per file keeps TS2589 away).
 */
import { Elysia, } from "elysia";
import { ageGateRoutes, } from "../../age-gate/controller";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { localInferenceRoutes, } from "../../inference/routes";
import { apiKeysRoutes, } from "../api-keys";
import { authProtectedRoutes, authPublicRoutes, } from "../auth";
import { frontendLogsRoutes, } from "../frontend-logs";
import { healthRoutes, } from "../health";
import { i18nRoutes, } from "../i18n";
import { keyManagementRoutes, } from "../key-management";
import { messageEncryptionRoutes, } from "../message-encryption";
import { deprecationAfterHandle, } from "../middleware/deprecation-headers";
import { versionResolver, } from "../middleware/version-resolver";
import { requestStatusRoutes, } from "../requests";
import { sessionsRoutes, } from "../sessions";
import { switchSessionRoutes, } from "../sessions-switch";
import { settingsRoutes, } from "../settings";
import { telemetryRoutes, } from "../telemetry";
import { usersRoutes, } from "../users";

export function baseSurface(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";

  // NOTE: each surface is its own Elysia barrel on purpose -- one chain of this
  // size exceeds TypeScript's instantiation depth (TS2589 in the typecheck gate).
  return new Elysia({ name: "v1", },)
    // MUST be registered BEFORE the route plugins: Elysia's onAfterHandle
    // only wraps routes declared after the hook (proven by probe test).
    .onAfterHandle(
      deprecationAfterHandle({
        enabled: () => process.env.API_V1_DEPRECATED === "1",
        deprecatedVersion: "1",
        successorVersion: "2",
        sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
      },),
    )
    .use(versionResolver(),)
    // ── Public surfaces ──────────────────────────────────────
    .use(healthRoutes(handleOpts, prefix,),)
    .use(authPublicRoutes(handleOpts, prefix,),)
    .use(i18nRoutes(handleOpts, prefix,),)
    .use(telemetryRoutes(handleOpts, prefix,),)
    .use(frontendLogsRoutes(prefix,),)
    .use(localInferenceRoutes(undefined, prefix,),)
    .use(ageGateRoutes({ database, }, prefix,),)
    // ── Auth-protected core ──────────────────────────────────
    .use(authProtectedRoutes({ database, }, prefix,),)
    .use(usersRoutes(handleOpts, prefix,),)
    .use(sessionsRoutes(handleOpts, prefix,),)
    .use(switchSessionRoutes(handleOpts, prefix,),)
    .use(apiKeysRoutes(handleOpts, prefix,),)
    .use(settingsRoutes(handleOpts, prefix,),)
    .use(requestStatusRoutes({ asyncStore: opts.asyncStore, }, prefix,),)
    .use(messageEncryptionRoutes(handleOpts, prefix,),)
    .use(keyManagementRoutes({ database, }, prefix,),);
}
