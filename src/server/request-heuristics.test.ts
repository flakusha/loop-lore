// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { normalizeProbePath, scoreRequestSignals, } from "./request-heuristics";

describe("normalizeProbePath", () => {
  test("collapses encoding, dot segments, duplicate slashes, and backslashes", () => {
    expect(normalizeProbePath("//.ENV",),).toBe("/.env",);
    expect(normalizeProbePath("/./%2eenv",),).toBe("/.env",);
    expect(normalizeProbePath("\\wp-config.php",),).toBe("/wp-config.php",);
    expect(normalizeProbePath("/%252eenv",),).toBe("/.env",);
  });
});

describe("scoreRequestSignals", () => {
  test("stays silent for ordinary API traffic", () => {
    const result = scoreRequestSignals(
      "/api/v1/environment",
      new Headers({
        "accept-language": "en",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
      },),
    );

    expect(result.signals,).toEqual([],);
    expect(result.score,).toBe(0,);
  });

  test("flags path probes only at a `/` or `.` boundary", () => {
    const headers = new Headers();
    expect(scoreRequestSignals("/api/v1/%2eenv/local", headers,).signals,).toContain("path-probe",);
    expect(scoreRequestSignals("/api/v1/environment", headers,).signals,).toEqual([],);
    expect(scoreRequestSignals("/api/v1/notes.env.local", headers,).signals,).toEqual([],);
    expect(scoreRequestSignals("/api/v1/config/.env.local", headers,).signals,).toContain("path-probe",);
  });

  test("flags impossible fetch metadata and headless client hints", () => {
    const result = scoreRequestSignals(
      "/",
      new Headers({
        "sec-ch-ua": '"HeadlessChrome";v="140"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "navigate",
      },),
    );

    expect(result.signals,).toEqual(["header-incoherent", "headless-ua",],);
    expect(result.score,).toBe(0.3,);
  });

  test("malformed escapes never throw", () => {
    const result = scoreRequestSignals("/%zz/.env", new Headers(),);
    expect(result.signals,).toEqual(["path-probe",],);
  });
});
