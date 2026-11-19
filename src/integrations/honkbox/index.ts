// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Honkbox integration — capability registry and Custom-provider wiring. */

export {
  cleanupHonkboxArtifact,
  DEFAULT_HONKBOX_ARTIFACT_MAX_BYTES,
  downloadHonkboxArtifactToTempFile,
  getHonkboxArtifactBytes,
  HONKBOX_ARTIFACTS_PATH,
  honkboxArtifactByteCap,
  HonkboxArtifactDeliveryUnavailableError,
  HonkboxArtifactValidationError,
  putHonkboxArtifact,
} from "./artifacts";
export type {
  DownloadedHonkboxArtifact,
  HonkboxArtifactByteRange,
  HonkboxArtifactClientOptions,
  HonkboxStoredArtifact,
} from "./artifacts";
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
  HonkboxArtifactDeliveryOptions,
  HonkboxArtifactDeliveryOutcome,
  HonkboxDispatchOptions,
  HonkboxImageArtifact,
} from "./provider";
export {
  honkboxChatBaseUrl,
  honkboxCustomProviderConfig,
  honkboxImageBaseUrl,
} from "./provider-config";
export type {
  HonkboxCustomProviderOptions,
} from "./provider-config";

export {
  ingestHonkboxJobResult,
  parseHonkboxJobEvent,
} from "./result-ingest";
export type {
  HonkboxJobEvent,
  IngestHonkboxJobResultOptions,
  IngestHonkboxJobResultOutcome,
} from "./result-ingest";
