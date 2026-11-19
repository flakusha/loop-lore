// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Honkbox integration — capability registry and Custom-provider wiring. */

export {
  assertNoDoubleGpuAdmission,
  clearHonkboxCapabilitiesCache,
  DEFAULT_HONKBOX_PROBE_TIMEOUT_MS,
  getHonkboxCapabilities,
  HONKBOX_CAPABILITIES_PATH,
  HONKBOX_FEATURE_KEYS,
  HONKBOX_SUPPORTED_API_MAJOR,
  honkboxAdmissionDecision,
  HonkboxAdmissionError,
  honkboxCacheKey,
  isHonkboxExternalToolAvailable,
  isHonkboxFeatureEnabled,
  normalizeHonkboxBaseUrl,
  parseHonkboxCapabilities,
  peekHonkboxCapabilities,
  probeHonkboxCapabilities,
  refreshHonkboxCapabilities,
} from "./capabilities";
export type {
  GetHonkboxCapabilitiesOptions,
  HonkboxAdmissionDecision,
  HonkboxAdmissionOwner,
  HonkboxAuth,
  HonkboxCapabilities,
  HonkboxCapabilityKey,
  HonkboxControlNetFeature,
  HonkboxFeatureFlags,
  HonkboxFeatureKey,
  HonkboxFormatLimits,
  HonkboxFormats,
  HonkboxOutputFormat,
  HonkboxProbeFailure,
  HonkboxProbeReason,
  HonkboxProbeResult,
  HonkboxProbeSuccess,
  HonkboxQueue,
  HonkboxQueueKind,
  HonkboxServerInfo,
  HonkboxVisionFeature,
  ProbeHonkboxOptions,
} from "./capabilities";
export {
  cancelHonkboxJob,
  getHonkboxJobs,
  HonkboxCapabilityUnavailableError,
  openHonkboxEventStream,
  runHonkboxChatTurn,
  runHonkboxImageJob,
  setupHonkboxCustomProvider,
} from "./provider";
export type {
  HonkboxDispatchOptions,
} from "./provider";
export {
  honkboxChatBaseUrl,
  honkboxCustomProviderConfig,
  honkboxImageBaseUrl,
} from "./provider-config";
export type {
  HonkboxCustomProviderOptions,
} from "./provider-config";
