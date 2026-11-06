// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Setup readiness checks for GET /api/v1/setup/state.
 *
 * Every check reads IN-PROCESS state only — no network scan, no cert
 * generation, no disk writes — so the endpoint stays a cheap read. Each check
 * is individually try/caught: one broken probe degrades to `ok: false` with a
 * hint instead of failing the whole response.
 *
 * The check ids are a STABLE public contract (consumed by the boot readiness
 * summary, /doctor and the provider-connection wizard): never rename one.
 */
import type { Kysely, } from "kysely";
import fs from "node:fs";
import { resolveModelRole, } from "../../admin/model-roles";
import { getHealthCache, } from "../../admin/provider-health";
import {
  isDevEnv,
  MIN_PII_SECRET_LENGTH,
  resolveNsfwPiiSecret,
  resolveReporterHashSecret,
  resolveTelemetryPiiSecret,
} from "../../config/load/pii-safety";
import type { Config, } from "../../config/schema";
import { isEncryptionEnabled, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { getNativeStatus, } from "../../native/loader";

/** One setup probe result. `hint` is present only when `ok` is false. */
export interface SetupCheck {
  id: string;
  ok: boolean;
  hint?: string;
}

/** Hint text naming the env var that must be set. */
function piiHint(envVar: string,): string {
  return `Set ${envVar} to at least ${MIN_PII_SECRET_LENGTH} characters (openssl rand -base64 48)`;
}

/**
 * Prod-gated PII secret check. Dev/test use the built-in fallbacks, so the
 * check only fails where the boot blocker actually bites.
 */
function piiCheck(config: Config,): SetupCheck {
  if (isDevEnv()) { return { id: "env.pii", ok: true, }; }

  const secrets: Array<{ envVar: string; resolve: () => string }> = [
    { envVar: "NSFW_PII_SECRET", resolve: () => resolveNsfwPiiSecret(config.nsfw,), },
    { envVar: "NSFW_FLAG_REPORTER_HASH_SECRET", resolve: () => resolveReporterHashSecret(config.nsfw,), },
    { envVar: "TELEMETRY_PII_SECRET", resolve: () => resolveTelemetryPiiSecret(config.observability?.telemetry,), },
  ];

  for (const secret of secrets) {
    let value: string;
    try {
      value = secret.resolve();
    } catch {
      return { id: "env.pii", ok: false, hint: piiHint(secret.envVar,), };
    }

    if (value.length < MIN_PII_SECRET_LENGTH) {
      return { id: "env.pii", ok: false, hint: piiHint(secret.envVar,), };
    }
  }

  return { id: "env.pii", ok: true, };
}

/** At least one registered provider is healthy (reads the health cache only). */
function providerHealthCheck(): SetupCheck {
  const cache = getHealthCache();
  if (cache.length === 0) {
    return { id: "provider.health", ok: false, hint: "No provider configured — connect one to enable generation.", };
  }

  if (cache.some((provider,) => provider.status === "healthy")) {
    return { id: "provider.health", ok: true, };
  }

  const failing = cache
    .filter((provider,) => provider.status !== "healthy")
    .map((provider,) => provider.error ? `${provider.name}: ${provider.error}` : provider.name)
    .join(", ",);

  return { id: "provider.health", ok: false, hint: `No healthy provider — ${failing}`, };
}

/** Message encryption is active (SMK loaded at boot). */
function smkCheck(): SetupCheck {
  return isEncryptionEnabled()
    ? { id: "smk", ok: true, }
    : { id: "smk", ok: false, hint: "Message encryption is disabled (no SERVER_ENCRYPTION_KEY).", };
}

/** The `main` model role resolves to a provider AND a model. */
async function modelRoleCheck(config: Config, db?: Kysely<DB>,): Promise<SetupCheck> {
  const resolved = await resolveModelRole("main", config, db as Kysely<DB>,);
  return resolved.provider && resolved.model
    ? { id: "model.roles", ok: true, }
    : { id: "model.roles", ok: false, hint: "Set the main model role to a provider and model.", };
}

/** The precompiled native module is loaded (falls back to pure JS otherwise). */
function nativeCheck(): SetupCheck {
  return getNativeStatus().available
    ? { id: "native", ok: true, }
    : {
      id: "native",
      ok: false,
      hint: "Native acceleration unavailable — falling back to the pure-JS implementation.",
    };
}

/** TLS key + certificate files exist. Never generates them — this is a read. */
function tlsCheck(config: Config,): SetupCheck {
  const tls = config.server?.tls;
  const ok = !!tls && fs.existsSync(tls.key,) && fs.existsSync(tls.cert,);
  return ok
    ? { id: "tls", ok: true, }
    : { id: "tls", ok: false, hint: "TLS certificate files are missing.", };
}

/** Run one probe; a throwing probe becomes `ok: false` with its message. */
async function runCheck(id: string, probe: () => SetupCheck | Promise<SetupCheck>,): Promise<SetupCheck> {
  try {
    return await probe();
  } catch (error) {
    return { id, ok: false, hint: error instanceof Error ? error.message : String(error,), };
  }
}

/**
 * Collect the six setup checks, in a stable order.
 * @param config - App config (PII secrets, TLS paths, generation defaults).
 * @param db - Optional database handle for model-role overrides.
 * @returns The six checks, always the same ids in the same order.
 */
export async function setupChecks(config: Config, db?: Kysely<DB>,): Promise<SetupCheck[]> {
  return [
    await runCheck("env.pii", () => piiCheck(config,),),
    await runCheck("provider.health", () => providerHealthCheck(),),
    await runCheck("smk", () => smkCheck(),),
    await runCheck("model.roles", () => modelRoleCheck(config, db,),),
    await runCheck("native", () => nativeCheck(),),
    await runCheck("tls", () => tlsCheck(config,),),
  ];
}
