// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { buildQualityMetadata, QUALITY_METADATA_KEY, qualityMetricsJson, } from "./metadata";

describe("metadata", () => {
  test("QUALITY_METADATA_KEY is quality", () => {
    expect(QUALITY_METADATA_KEY,).toBe("quality",);
  });

  test("buildQualityMetadata wraps the metrics under the quality key", () => {
    const doc = buildQualityMetadata({
      repetitionRate: 0.5,
      finishReason: "stop",
    },);

    const parsed = JSON.parse(doc,) as {
      quality: { repetitionRate: number; finishReason: string };
    };

    expect(parsed.quality.repetitionRate,).toBe(0.5,);
    expect(parsed.quality.finishReason,).toBe("stop",);
  });

  test("qualityMetricsJson round-trips the metrics", () => {
    const json = qualityMetricsJson({ repetitionRate: 0.25, finishReason: "length", },);
    expect(JSON.parse(json,),).toEqual({ repetitionRate: 0.25, finishReason: "length", },);
  });
});
