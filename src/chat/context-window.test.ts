// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { getThresholdState, } from "./context-window";

describe("getThresholdState", () => {
  it("classifies usage with default thresholds", () => {
    expect(getThresholdState(0,),).toBe("healthy",);
    expect(getThresholdState(59,),).toBe("healthy",);
    expect(getThresholdState(60,),).toBe("warning",);
    expect(getThresholdState(79,),).toBe("warning",);
    expect(getThresholdState(80,),).toBe("critical",);
    expect(getThresholdState(94,),).toBe("critical",);
    expect(getThresholdState(95,),).toBe("imminent",);
    expect(getThresholdState(100,),).toBe("imminent",);
    expect(getThresholdState(150,),).toBe("imminent",);
  });

  it("classifies usage with custom thresholds", () => {
    const thresholds = { warning: 10, critical: 20, imminent: 30, };

    expect(getThresholdState(5, thresholds,),).toBe("healthy",);
    expect(getThresholdState(10, thresholds,),).toBe("warning",);
    expect(getThresholdState(25, thresholds,),).toBe("critical",);
    expect(getThresholdState(30, thresholds,),).toBe("imminent",);
  });
});
