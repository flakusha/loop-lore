// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Link normalization: array tuples and definition objects → one shape.
 *
 * Top-level workflows encode links as `[id, origin, slot, target, slot,
 * type]` tuples; subgraph definitions emit objects. Node ids stay opaque
 * strings throughout — never `Number()`ed (see Defect 2 in the epic).
 *
 * @module comfyui-converter/links
 * @throws {ConverterError} On malformed link encodings.
 */
import { jsonStringifyOr, } from "../../utils";
import type { SubgraphBoundaryPin, UiLink, } from "./types";
import { ConverterError, } from "./types";

/** A link decoded to one canonical shape regardless of UI encoding. */
export interface FlatLink {
  readonly id: number;
  readonly originId: string;
  readonly originSlot: number;
  readonly targetId: string;
  readonly targetSlot: number;
  readonly type: string;
}

/**
 * Normalize either link encoding to one shape; ids stay strings.
 * @throws {ConverterError} On malformed link encodings.
 */
export function normalizeLink(link: UiLink,): FlatLink {
  if (Array.isArray(link,)) {
    const [id, originId, originSlot, targetId, targetSlot, type,] = link;
    if (typeof id !== "number" || typeof originSlot !== "number" || typeof targetSlot !== "number") {
      throw new ConverterError({ kind: "malformed-link", detail: jsonStringifyOr(link,), },);
    }

    return {
      id,
      originId: String(originId,),
      originSlot,
      targetId: String(targetId,),
      targetSlot,
      type: String(type,),
    };
  }

  const candidate = link as Partial<
    Record<"id" | "origin_id" | "origin_slot" | "target_id" | "target_slot" | "type", unknown>
  >;

  if (
    typeof candidate.id !== "number" || typeof candidate.origin_slot !== "number" ||
    typeof candidate.target_slot !== "number"
  ) {
    throw new ConverterError({ kind: "malformed-link", detail: jsonStringifyOr(link,), },);
  }

  return {
    id: candidate.id,
    originId: String(candidate.origin_id,),
    originSlot: candidate.origin_slot,
    targetId: String(candidate.target_id,),
    targetSlot: candidate.target_slot,
    type: String(candidate.type,),
  };
}

/** Index links by id for boundary fan-out lookups. */
export function indexLinks(links: readonly UiLink[],): Map<number, FlatLink> {
  const table = new Map<number, FlatLink>();
  for (const link of links ?? []) {
    const flat = normalizeLink(link,);
    table.set(flat.id, flat,);
  }

  return table;
}

/** Inner targets of one boundary pin's links (input side: inputNode → node). */
export function pinTargets(
  pin: SubgraphBoundaryPin,
  innerLinks: Map<number, FlatLink>,
  inputNodeId: string,
): FlatLink[] {
  const found: FlatLink[] = [];
  for (const linkId of pin.linkIds ?? []) {
    const link = innerLinks.get(linkId,);
    if (link !== undefined && link.originId === inputNodeId) { found.push(link,); }
  }

  return found;
}

/** Inner origins of one boundary pin's links (output side: node → outputNode). */
export function pinOrigins(
  pin: SubgraphBoundaryPin,
  innerLinks: Map<number, FlatLink>,
  outputNodeId: string,
): FlatLink[] {
  const found: FlatLink[] = [];
  for (const linkId of pin.linkIds ?? []) {
    const link = innerLinks.get(linkId,);
    if (link !== undefined && link.targetId === outputNodeId) { found.push(link,); }
  }

  return found;
}
