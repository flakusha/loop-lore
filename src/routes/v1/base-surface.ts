// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * v1 baseSurface barrel (split out: one Elysia chain per file keeps TS2589 away).
 */
import { Elysia, } from "elysia";
import { ageGateRoutes, } from "../../age-gate/controller";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { localInferenceRoutes, } from "../../inference/routes";
import { createMessageBridge, type MessageBridge, } from "../../integrations/bridge";
import { createEmailAdapter, EMAIL_ADAPTER_NAME, type EmailTransport, } from "../../integrations/email/adapter";
import { createSmtpTransport, } from "../../integrations/email/smtp-transport";
import { createBridgeRegistry, } from "../../integrations/registry";
import {
  createTelegramAdapter,
  isTelegramChatId,
  TELEGRAM_ADAPTER_NAME,
  type TelegramTransport,
} from "../../integrations/telegram/adapter";
import { actorPlanRoutes, } from "../actor-plan";
import { apiKeysRoutes, } from "../api-keys";
import { authProtectedRoutes, authPublicRoutes, } from "../auth";
import { comfyUIModelRoutes, } from "../comfyui-models";
import { emojiRoutes, } from "../emoji";
import { frontendLogsRoutes, } from "../frontend-logs";
import { healthRoutes, } from "../health";
import { i18nRoutes, } from "../i18n";
import { keyManagementRoutes, } from "../key-management";
import { messageEncryptionRoutes, } from "../message-encryption";
import { deprecationAfterHandle, } from "../middleware/deprecation-headers";
import { versionResolver, } from "../middleware/version-resolver";
import { planningRoutes, } from "../planning";
import { planningBoardRoutes, } from "../planning-board";
import { requestStatusRoutes, } from "../requests";
import { sessionsRoutes, } from "../sessions";
import { switchSessionRoutes, } from "../sessions-switch";
import { settingsRoutes, } from "../settings";
import { setupRoutes, } from "../setup/routes";
import { telemetryRoutes, } from "../telemetry";
import { usersRoutes, } from "../users";

/**
 * Build the production MFA delivery bridge from the loaded integrations
 * config. Email and Telegram configure independently; neither configured
 * returns undefined so issue routes fail closed (503).
 * @param config Loaded application config.
 * @param transport Explicit email transport for tests; production builds one from config.
 * @param telegramTransport Explicit Telegram transport for tests.
 * @returns The bridge, or undefined when no delivery channel is configured.
 */
export function createMfaBridge(
  config: RegisterPluginsOpts["config"],
  transport?: EmailTransport,
  telegramTransport?: TelegramTransport,
): MessageBridge | undefined {
  const integrations = config.integrations;
  if (integrations?.enabled !== true) { return undefined; }

  const email = integrations.email;
  const telegram = integrations.telegram;
  const emailConfigured = email?.enabled === true &&
    email.smtpHost.trim() !== "" && email.smtpUser.trim() !== "";

  const telegramConfigured = telegram?.enabled === true;
  if (!emailConfigured && !telegramConfigured) { return undefined; }

  const registry = createBridgeRegistry();
  if (emailConfigured) {
    const emailTransport = transport ?? createSmtpTransport({
      host: email.smtpHost,
      port: email.smtpPort,
      user: email.smtpUser,
      password: email.smtpPass,
    },);

    const adapter = createEmailAdapter({ transport: emailTransport, },);
    // connect() has no awaits in its body — the connected flags are set before
    // the bridge can see a request, so fire-and-forget is safe here.
    void adapter.connect({ ...email, },);
    registry.register(adapter,);
  }

  if (telegramConfigured) {
    const adapter = createTelegramAdapter(
      telegramTransport === undefined ? {} : { transport: telegramTransport, },
    );

    // An empty config token is fine: the MFA token is read fresh from
    // system_config and handed to the adapter at call time.
    void adapter.connect({ botToken: telegram.botToken, },);
    registry.register(adapter,);
  }

  return createMessageBridge(registry, {
    // The admin can rotate the system_config token at any time; a frozen
    // token → adapter map would strand every token issued after startup.
    tokenBindingResolver: (token, target,) => {
      if (token.trim() === "") { return undefined; }
      // One MFA token can serve both channels: bind by target shape, then
      // let each adapter's ownsTarget reject anything it does not own.
      if (telegramConfigured && isTelegramChatId(target,)) { return TELEGRAM_ADAPTER_NAME; }
      if (emailConfigured) { return EMAIL_ADAPTER_NAME; }
      return undefined;
    },
  },);
}

/**
 * @param {RegisterPluginsOpts & { bridge?: MessageBridge }} opts
 * @returns The v1 Elysia surface with MFA delivery wired through auth routes.
 */
export function baseSurface(opts: RegisterPluginsOpts & { bridge?: MessageBridge },) {
  const { database, config, } = opts;
  const bridge = opts.bridge ?? createMfaBridge(config,);
  const handleOpts = { database, config, bridge, };
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
    .use(emojiRoutes({ prefix, },),)
    .use(i18nRoutes(handleOpts, prefix,),)
    .use(telemetryRoutes(handleOpts, prefix,),)
    .use(frontendLogsRoutes(prefix,),)
    .use(localInferenceRoutes(undefined, prefix,),)
    .use(ageGateRoutes({ database, }, prefix,),)
    // ── Auth-protected core ──────────────────────────────────
    .use(authProtectedRoutes(handleOpts, prefix,),)
    .use(usersRoutes(handleOpts, prefix,),)
    .use(sessionsRoutes(handleOpts, prefix,),)
    .use(switchSessionRoutes(handleOpts, prefix,),)
    .use(apiKeysRoutes(handleOpts, prefix,),)
    .use(settingsRoutes(handleOpts, prefix,),)
    .use(comfyUIModelRoutes(handleOpts, prefix,),)
    .use(planningRoutes({ database, }, prefix,),)
    .use(planningBoardRoutes({ database, }, prefix,),)
    .use(actorPlanRoutes({ database, }, prefix,),)
    .use(requestStatusRoutes({ asyncStore: opts.asyncStore, }, prefix,),)
    .use(messageEncryptionRoutes(handleOpts, prefix,),)
    .use(keyManagementRoutes({ database, }, prefix,),)
    .use(setupRoutes(handleOpts, prefix,),);
}
