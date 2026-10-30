// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/object_info` spec shapes: tag, bounds, and static-option readers.
 *
 * The pinned snapshot carries bare tags (`["INT"]`, `["COMBO"]`) or
 * rich specs (`["FLOAT", { min, max, step }]`, `[["a", "b"]]`).
 * These readers decode that shape; type mapping lives in `type-map.ts`.
 *
 * @module comfyui-params/spec-shape
 */
import type { ObjectInfoClass, } from "../comfyui-converter/types";

/** First element of an `/object_info` input spec: the socket/widget tag. */
export function specTagOf(spec: readonly unknown[] | undefined,): string {
  if (spec === undefined || spec.length === 0) { return "?"; }

  const first = spec[0];
  if (typeof first === "string") { return first; }
  if (Array.isArray(first,)) { return "COMBO"; }

  return "?";
}

/** Declared spec of one input on a snapshot class, or undefined. */
export function specOf(info: ObjectInfoClass | undefined, name: string,): readonly unknown[] | undefined {
  return info?.input?.required?.[name] ?? info?.input?.optional?.[name];
}

/** Numeric bounds carried by an INT/FLOAT spec's second element. */
export interface SpecBounds {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** Bounds of an INT/FLOAT spec; empty when the spec carries none. */
export function boundsOf(spec: readonly unknown[] | undefined,): SpecBounds {
  if (spec === undefined || spec.length < 2) { return {}; }

  const opts = spec[1];
  if (typeof opts !== "object" || opts === null || Array.isArray(opts,)) { return {}; }

  const record = opts as Readonly<Record<string, unknown>>;
  const pick = (key: string,): number | undefined => {
    const value = record[key];

    return typeof value === "number" && Number.isFinite(value,) ? value : undefined;
  };

  const min = pick("min",);
  const max = pick("max",);
  const step = pick("step",);

  return {
    ...(min === undefined ? {} : { min, }),
    ...(max === undefined ? {} : { max, }),
    ...(step === undefined ? {} : { step, }),
  };
}

/** Static option list of a COMBO spec; null when the spec has none. */
export function staticOptions(spec: readonly unknown[] | undefined,): Array<{ label: string; value: unknown }> | null {
  if (spec === undefined || spec.length === 0) { return null; }

  const first = spec[0];
  if (!Array.isArray(first,)) { return null; }

  return first.map((option,) => ({ label: String(option,), value: option, }));
}
