// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/image` ComfyUI-first opt-in ordering (TASK-sd-cpp-provider AC).
 *
 * When the operator enables `generation.imageRouting.comfyUiFirst`, healthy
 * ComfyUI candidates (stored setups or config providers) are ordered ahead of
 * the rest of the failover chain; everything else keeps its relative order.
 * This is pure ordering — the walk's per-family discovery gate still skips an
 * unreachable ComfyUI with the structured reason and falls through, so the
 * knob can never make a dead instance a black hole.
 *
 * Default (knob off) is the exact current behavior: the candidate list is
 * returned untouched.
 */

import type { ImageProviderConfig, } from "../../config/schema";

/**
 * Order the failover candidates for `/image` under the ComfyUI-first knob.
 * @param candidates - the purpose-filtered candidate list (config + stored setups)
 * @param comfyUiFirst - the `imageRouting.comfyUiFirst` knob (default false)
 * @returns the ordered list; the SAME array instance when the knob is off
 */
export function comfyUiFirstOrder(
  candidates: ImageProviderConfig[],
  comfyUiFirst: boolean | undefined,
): ImageProviderConfig[] {
  if (!comfyUiFirst) { return candidates; }

  const comfy: ImageProviderConfig[] = [];
  const rest: ImageProviderConfig[] = [];
  for (const candidate of candidates) {
    const target = candidate.apiFamily === "comfyui" ? comfy : rest;
    target.push(candidate,);
  }

  return [...comfy, ...rest,];
}
