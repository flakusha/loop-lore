// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI sampling-axis discovery.
 *
 * `sampler_name` and `scheduler` are two independent KSampler inputs; both
 * enums come from the operator's `/object_info`, never from a shipped array.
 * Uses the shared generation discovery cache (same five-minute TTL as LoRA).
 * @module generation/comfyui-sampling
 */
import { cachedDiscovery, } from "./discovery-cache";
import { fetchWithTimeout, } from "./lora/discovery-http";

/** One `/object_info` sampling-enum pass. */
export interface SamplingDiscoveryResult {
  /** Installed sampler names (KSampler `sampler_name` options). */
  samplers: string[];
  /** Installed schedulers (KSampler `scheduler` options). */
  schedulers: string[];
  /** False when ComfyUI could not be reached. */
  reachable: boolean;
  /** Advisory for an unreachable server or a graph with no KSampler node. */
  advisory?: string;
  timestamp: number;
}

interface ObjectInfoSnapshot {
  [nodeClass: string]: unknown;
}

interface KSamplerInfo {
  input?: { required?: Record<string, unknown> };
}

/** Node classes carrying both axes, in fallback order. */
const SAMPLER_NODE_CLASSES = ["KSampler", "KSamplerAdvanced",] as const;

/** Read a COMBO option list from one required widget spec. */
function enumFrom(info: KSamplerInfo | undefined, widget: string,): string[] {
  const spec = info?.input?.required?.[widget];
  const values = Array.isArray(spec,) ? spec[0] : undefined;

  return Array.isArray(values,)
    ? values.filter((value,): value is string => typeof value === "string" && value.length > 0)
    : [];
}

/**
 * Discover installed samplers and schedulers from ComfyUI.
 * @param baseUrl - ComfyUI base URL
 * @param options - Optional timeout, forced refresh and node class override
 * @returns enums plus an advisory; never throws for an unreachable server
 */
export async function discoverComfyUISampling(
  baseUrl: string,
  options?: { timeoutMs?: number; forceRefresh?: boolean; nodeClass?: string },
): Promise<SamplingDiscoveryResult> {
  const timestamp = Date.now();

  return cachedDiscovery<SamplingDiscoveryResult>(
    `sampling:${baseUrl}`,
    async () => {
      try {
        const url = `${baseUrl.replace(/\/+$/, "",)}/object_info`;
        const response = await fetchWithTimeout(url, options?.timeoutMs ?? 10_000,);
        if (!response.ok) {
          return {
            samplers: [],
            schedulers: [],
            reachable: false,
            advisory: `ComfyUI returned ${response.status}: ${response.statusText}`,
            timestamp,
          };
        }

        const data = await response.json() as ObjectInfoSnapshot;
        const classes = options?.nodeClass
          ? [options.nodeClass, ...SAMPLER_NODE_CLASSES,]
          : SAMPLER_NODE_CLASSES;

        let info: KSamplerInfo | undefined;
        for (const name of classes) {
          const candidate = data[name];
          if (candidate && typeof candidate === "object") {
            info = candidate as KSamplerInfo;
            break;
          }
        }

        // An upscale-only or passthrough graph may have no KSampler at all.
        // That is not a discovery failure: empty enums, no error, no throw.
        if (!info) {
          return {
            samplers: [],
            schedulers: [],
            reachable: true,
            advisory: "No KSampler node in ComfyUI /object_info",
            timestamp,
          };
        }

        return {
          samplers: enumFrom(info, "sampler_name",),
          schedulers: enumFrom(info, "scheduler",),
          reachable: true,
          timestamp,
        };
      } catch (error) {
        return {
          samplers: [],
          schedulers: [],
          reachable: false,
          advisory: `ComfyUI sampling discovery failed: ${error instanceof Error ? error.message : String(error,)}`,
          timestamp,
        };
      }
    },
    { forceRefresh: options?.forceRefresh, shouldCache: (result,) => result.reachable, },
  );
}
