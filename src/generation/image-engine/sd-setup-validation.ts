// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stored-setup input validation — the pure half of the sd-setup store
 * (`sd-setup-store.ts`). Operator input is rejected before anything is
 * stored; persistence lives in the store module.
 */
import type { ImageProviderDefaults, } from "../../config/schema";
import { isMetadataTarget, validateProviderUrl, } from "../../utils/url-validation";

/** Input for `saveSdSetup` — operator-entered stored-setup payload. */
export interface SaveSdSetupInput {
  /** Unique instance name. */
  readonly name: string;
  /** Human-readable label (defaults to the name). */
  readonly label?: string;
  /** Server base URL. */
  readonly baseUrl: string;
  /** What the instance is for (default "both"). */
  readonly purpose?: "generate" | "edit" | "both";
  /** Generation defaults; omitted fields fall back to the family defaults. */
  readonly defaults?: Partial<ImageProviderDefaults>;
  /** ComfyUI workflow name (filename without extension); ComfyUI setups only. */
  readonly workflow?: string;
  /** API key for reverse-proxy-fronted servers; empty string clears a stored key. */
  readonly apiKey?: string;
}

/** Base shape of a stored setup descriptor — the JSON under `<family>.<name>.config`. */
export interface StoredSdSetup {
  name?: unknown;
  label?: unknown;
  baseUrl?: unknown;
  purpose?: unknown;
  defaults?: unknown;
  workflow?: unknown;
  storedAt?: unknown;
}

/** Public descriptor of a stored setup — never carries key material. */
export interface SdSetupDescriptorBase {
  /** Unique instance name. */
  readonly name: string;
  /** Human-readable label. */
  readonly label: string;
  /** Server base URL. */
  readonly baseUrl: string;
  /** What the instance is for. */
  readonly purpose: "generate" | "edit" | "both";
  /** Generation defaults. */
  readonly defaults: ImageProviderDefaults;
  /** Whether a sealed API key is stored — never the key itself. */
  readonly hasApiKey: boolean;
}

/** A parsed stored descriptor before the hasApiKey hydration. */
export type ParsedSdSetup = Omit<SdSetupDescriptorBase, "hasApiKey"> & { workflow?: string };

/** Provider instance names are slug-ish: letters, digits, dot, dash, underscore. */
export const SD_SETUP_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Fallback generation defaults — mirrors the boot auto-discovery shape. */
export const SD_SETUP_DEFAULTS: ImageProviderDefaults = {
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  sampler: "euler",
};

/** Default connection timeout for a stored instance (ms). */
export const SD_SETUP_TIMEOUT_MS = 30_000;

/** Default generation deadline for a stored instance (ms). */
export const SD_SETUP_GENERATION_TIMEOUT_MS = 120_000;

/** Raised when operator input for a stored setup is rejected. */
export class SdSetupValidationError extends Error {
  /** The offending field, when the rejection is about one input. */
  readonly field?: string;

  constructor(message: string, field?: string,) {
    super(message,);
    this.name = "SdSetupValidationError";
    this.field = field;
  }
}

/**
 * Validate one generation-defaults field against its range.
 * @param field - defaults field name
 * @param value - operator-supplied value
 * @returns the validated value
 * @throws {SdSetupValidationError} when the value is out of range
 */
export function assertDefaultField<K extends keyof ImageProviderDefaults,>(
  field: K,
  value: ImageProviderDefaults[K],
): ImageProviderDefaults[K] {
  if (field === "cfgScale") {
    if (typeof value !== "number" || !Number.isFinite(value,) || value <= 0) {
      throw new SdSetupValidationError("defaults.cfgScale must be a positive number", "defaults.cfgScale",);
    }

    return value;
  }

  if (field === "negativePrompt" || field === "sampler" || field === "scheduler") {
    if (typeof value !== "string" || value.length === 0) {
      throw new SdSetupValidationError(`defaults.${field} must be a non-empty string`, `defaults.${field}`,);
    }

    return value;
  }

  if (typeof value !== "number" || !Number.isInteger(value,) || value <= 0) {
    throw new SdSetupValidationError(`defaults.${field} must be a positive integer`, `defaults.${field}`,);
  }

  return value;
}

/**
 * Validate an operator-entered setup before anything is stored.
 * @param input - the operator payload
 * @returns the normalized descriptor fields (label, purpose, defaults)
 * @throws {SdSetupValidationError} when the name, base URL, purpose, workflow or defaults are invalid
 */
export function assertValidSetupInput(
  input: SaveSdSetupInput,
): { label: string; purpose: "generate" | "edit" | "both"; defaults: ImageProviderDefaults } {
  if (!SD_SETUP_NAME_PATTERN.test(input.name,)) {
    throw new SdSetupValidationError(
      "name must be 1-64 slug characters (letters, digits, dot, dash, underscore) and start with a letter or digit",
      "name",
    );
  }

  const validatedUrl = validateProviderUrl(input.baseUrl,);
  if (!validatedUrl.ok) {
    throw new SdSetupValidationError(`baseUrl rejected: ${validatedUrl.error}`, "baseUrl",);
  }

  // The sync URL validator does not resolve DNS, so a literal link-local or
  // cloud-metadata host passes it — reject those here (no stored provider may
  // point at metadata endpoints).
  if (isMetadataTarget(new URL(input.baseUrl,).hostname,)) {
    throw new SdSetupValidationError("baseUrl must not point at a link-local or cloud-metadata target", "baseUrl",);
  }

  const purpose = input.purpose ?? "both";
  if (purpose !== "generate" && purpose !== "edit" && purpose !== "both") {
    throw new SdSetupValidationError(`purpose must be "generate", "edit" or "both"`, "purpose",);
  }

  if (
    input.workflow !== undefined &&
    (typeof input.workflow !== "string" || input.workflow.length === 0 || input.workflow.length > 200)
  ) {
    throw new SdSetupValidationError(
      "workflow must be a non-empty string of at most 200 characters",
      "workflow",
    );
  }

  const supplied = input.defaults ?? {};
  const defaults: ImageProviderDefaults = {
    width: supplied.width !== undefined ? assertDefaultField("width", supplied.width,) : SD_SETUP_DEFAULTS.width,
    height: supplied.height !== undefined ? assertDefaultField("height", supplied.height,) : SD_SETUP_DEFAULTS.height,
    steps: supplied.steps !== undefined ? assertDefaultField("steps", supplied.steps,) : SD_SETUP_DEFAULTS.steps,
    cfgScale: supplied.cfgScale !== undefined
      ? assertDefaultField("cfgScale", supplied.cfgScale,)
      : SD_SETUP_DEFAULTS.cfgScale,
    sampler: supplied.sampler !== undefined
      ? assertDefaultField("sampler", supplied.sampler,)
      : SD_SETUP_DEFAULTS.sampler,
    ...(supplied.negativePrompt !== undefined
      ? { negativePrompt: assertDefaultField("negativePrompt", supplied.negativePrompt,), }
      : {}),
  };

  return { label: input.label ?? input.name, purpose, defaults, };
}
