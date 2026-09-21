// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/pii-safety.ts — Prod-gated PII secret validation at config-load time

import type { Config, } from "../schema";

/** Minimum HMAC secret length for PII pseudonymization. Same brute-force floor as JWT. */
export const MIN_PII_SECRET_LENGTH = 32;

export const NSFW_PII_DEV_FALLBACK = "nsfw-pii-dev-secret-do-not-use-in-prod";
export const REPORTER_HASH_DEV_FALLBACK = "loop-lore-nsfw-default-do-not-use-in-prod";
export const TELEMETRY_PII_DEV_FALLBACK = "telemetry-pii-dev-secret-do-not-use-in-prod";

/** Unset/empty NODE_ENV counts as production-like. */
export function isDevEnv(): boolean {
  const env = process.env["NODE_ENV"] ?? "";
  return env === "test" || env === "development" || env === "dev";
}

/** First non-empty trimmed candidate, or undefined. */
function firstSet(...candidates: Array<string | undefined>): string | undefined {
  for (const c of candidates) {
    if (c !== undefined && c.trim() !== "") { return c; }
  }
  return undefined;
}

/**
 * Resolve one PII-class secret: merged Config wins, raw process.env is the
 * documented fallback, then the hardcoded dev fallback.
 */
export function resolvePiiSecret(
  configured: string | undefined,
  envNames: string[],
  devFallback: string,
  missingMessage: string,
): string {
  const configuredOrEnv = firstSet(
    configured,
    ...envNames.map((n,) => process.env[n]),
  );
  if (configuredOrEnv !== undefined) { return configuredOrEnv; }
  if (isDevEnv()) { return devFallback; }
  throw new Error(`${missingMessage}\nGenerate with \`openssl rand -base64 48\`.`,);
}

const GEN_HINT = "Generate with `openssl rand -base64 48`.";

/** Resolve the effective NSFW PII secret (gate audit hashing). */
export function resolveNsfwPiiSecret(config?: { piiSecret?: string },): string {
  return resolvePiiSecret(
    config?.piiSecret,
    ["NSFW_PII_SECRET",],
    NSFW_PII_DEV_FALLBACK,
    "NSFW_PII_SECRET (or observability.nsfw.piiSecret in config/env) is required in production.",
  );
}

/**
 * Resolve the effective reporter-hash secret: explicit reporter secret wins,
 * then the legacy moderation HMAC env, then the NSFW PII secret.
 */
export function resolveReporterHashSecret(config?: { piiSecret?: string; reporterHashSecret?: string },): string {
  return resolvePiiSecret(
    config?.reporterHashSecret,
    [
      "NSFW_FLAG_REPORTER_HASH_SECRET",
      "NSFW_MODERATION_HMAC_SECRET",
      "NSFW_PII_SECRET",
    ],
    REPORTER_HASH_DEV_FALLBACK,
    "NSFW_FLAG_REPORTER_HASH_SECRET (or observability.nsfw.reporterHashSecret) is required in production.",
  );
}

/** Resolve the effective admin-telemetry PII secret. */
export function resolveTelemetryPiiSecret(config?: { piiSecret?: string },): string {
  return resolvePiiSecret(
    config?.piiSecret,
    ["TELEMETRY_PII_SECRET",],
    TELEMETRY_PII_DEV_FALLBACK,
    "TELEMETRY_PII_SECRET (or observability.telemetry.piiSecret in config/env) is required in production.",
  );
}

/** Short-secret guard shared by all three PII secrets (prod only). */
function assertPiiLength(name: string, secret: string,): void {
  if (secret.length < MIN_PII_SECRET_LENGTH) {
    throw new Error(
      `${name} is only ${secret.length} characters. Production requires at least ${MIN_PII_SECRET_LENGTH}. ${GEN_HINT}`,
    );
  }
}

/**
 * Validate PII-class secrets at config-load time so a production boot without
 * adequate secrets fails immediately with a clear message rather than silently
 * pseudonymizing with a trivially brute-forced key.
 */
export function validatePiiSafety(config: Config,): void {
  if (!isDevEnv()) {
    assertPiiLength("NSFW PII secret", resolveNsfwPiiSecret(config.nsfw,),);
    assertPiiLength("Reporter-hash secret", resolveReporterHashSecret(config.nsfw,),);
    assertPiiLength("Telemetry PII secret", resolveTelemetryPiiSecret(config.observability?.telemetry,),);
  }
}
