// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Observe-only signals over request data the access log already carries.
 * Scores are advisory; no caller may use them to block or label a user.
 */

/** Fixed weights, not calibrated probabilities. */
const WEIGHTS = {
  "header-incoherent": 0.2,
  "headless-ua": 0.1,
  "path-probe": 0.6,
} as const;

/** Markers matched only at a `/` or `.` boundary. */
const PATH_MARKERS = [".env", "wp-config.php", ".git/config", "id_rsa", "actuator/env",] as const;

export interface RequestSignalResult {
  /** Additive advisory score in 0..1; never an enforcement verdict. */
  readonly score: number;
  readonly signals: readonly (keyof typeof WEIGHTS)[];
}

/**
 * Decode a pathname up to three times; malformed escapes never throw.
 * @param pathname
 */
function decodePath(pathname: string,): string {
  let decoded = pathname;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded,);
      if (next === decoded) { break; }
      decoded = next;
    } catch {
      return decoded;
    }
  }

  return decoded;
}

/**
 * Normalize path tricks (`//.env`, `/./.env`, `/%2eenv`) into one key.
 * @param pathname
 */
export function normalizeProbePath(pathname: string,): string {
  return decodePath(pathname,)
    .replaceAll("\\", "/",)
    .replace(/\/{2,}/g, "/",)
    .replace(/\/\.\//g, "/",)
    .toLowerCase();
}

/**
 * @param normalized - output of {@link normalizeProbePath}
 */
function hasProbeMarker(normalized: string,): boolean {
  return PATH_MARKERS.some((marker,) => {
    const index = normalized.indexOf(marker,);
    if (index < 0) { return false; }
    const before = normalized[index - 1];
    return before === undefined || before === "/" || before === ".";
  },);
}

/**
 * Score a request from path and headers alone. Returns no signals for the
 * common case so the access log pays only for suspicious traffic.
 * @param path - raw `URL.pathname`
 * @param headers - request headers
 * @returns advisory signals and score
 */
export function scoreRequestSignals(
  path: string,
  headers: Headers,
): RequestSignalResult {
  const signals: (keyof typeof WEIGHTS)[] = [];

  if (hasProbeMarker(normalizeProbePath(path,),)) {
    signals.push("path-probe",);
  }

  const mode = headers.get("sec-fetch-mode",);
  const dest = headers.get("sec-fetch-dest",);
  if (mode === "navigate" && dest === "empty") {
    signals.push("header-incoherent",);
  }

  if (headers.get("sec-ch-ua",)?.includes("HeadlessChrome",) === true) {
    signals.push("headless-ua",);
  }

  // ponytail: fixed weights; recalibrate only with observed false-positive data.
  const sum = signals.reduce((total, signal,) => total + WEIGHTS[signal], 0,);
  return { score: Math.round(Math.min(1, sum,) * 100,) / 100, signals, };
}
