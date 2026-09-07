import { describe, expect, test, } from "bun:test";
import { formatting, } from "./formatting";

describe("adminTemplates.formatting", () => {
  test("formatDetail maps known detail levels", () => {
    expect(formatting.formatDetail("instant",),).toBe("Instant",);
    expect(formatting.formatDetail("balanced",),).toBe("Balanced",);
    expect(formatting.formatDetail("detailed",),).toBe("Detailed",);
  });

  test("formatDetail passes unknown values through", () => {
    expect(formatting.formatDetail("hyper",),).toBe("hyper",);
    expect(formatting.formatDetail("",),).toBe("",);
  });

  test("formatMode maps known modes", () => {
    expect(formatting.formatMode("yourself",),).toBe("Yourself",);
    expect(formatting.formatMode("face",),).toBe("Face",);
    expect(formatting.formatMode("me",),).toBe("Me",);
    expect(formatting.formatMode("scene",),).toBe("Scene",);
    expect(formatting.formatMode("last",),).toBe("Last",);
    expect(formatting.formatMode("background",),).toBe("Background",);
  });

  test("formatMode passes unknown values through", () => {
    expect(formatting.formatMode("custom-mode",),).toBe("custom-mode",);
    expect(formatting.formatMode("",),).toBe("",);
  });
});
