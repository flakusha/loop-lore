// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { log as rootLog, } from "../logger";

export const log = rootLog.child({ module: "admin-models", },);

/**
 * Match a human parameter-size label: optional decimal number with an
 * optional magnitude suffix (`B`/billion, `M`/million, `K`/thousand).
 */
const PARAM_SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*(b|billion|m|million|k|thousand)?$/i;

/**
 * Parse a model parameter-size label ("8B", "110M", "0.5b", "7") into
 * billions of parameters. Suffix-tolerant; strict `parseFloat` rejects
 * labels like "8B" outright, which silently dropped size-based
 * suitability tiers.
 * @param text - Raw parameter-size label.
 * @param fallback - Value returned when the label is unparseable.
 * @returns Size in billions of parameters, or `fallback`.
 * @example
 * parseParamSizeOr("8B", Number.NaN,); // 8
 * parseParamSizeOr("110M", Number.NaN,); // 0.11
 * parseParamSizeOr("n/a", Number.NaN,); // NaN
 */
export function parseParamSizeOr(text: string, fallback: number,): number {
  const match = PARAM_SIZE_PATTERN.exec(text.trim(),);
  if (!match) { return fallback; }
  const value = Number(match[1],);
  if (!Number.isFinite(value,)) { return fallback; }
  const unit = match[2]?.toLowerCase();
  if (unit === "m" || unit === "million") { return value / 1_000; }
  if (unit === "k" || unit === "thousand") { return value / 1_000_000; }
  return value;
}
