import "./i18n.test-helper";
import { describe, expect, test, } from "bun:test";
import { autoResize, } from "./auto-resize";

describe("autoResize", () => {
  test("clamps to 200px by default", () => {
    const textarea = document.createElement("textarea",);
    Object.defineProperty(textarea, "scrollHeight", { value: 500, writable: true, configurable: true, },);

    autoResize(textarea,);

    expect(textarea.style.height,).toBe("200px",);
  });

  test("respects an explicit maxPx override", () => {
    const textarea = document.createElement("textarea",);
    Object.defineProperty(textarea, "scrollHeight", { value: 500, writable: true, configurable: true, },);

    autoResize(textarea, 300,);

    expect(textarea.style.height,).toBe("300px",);
  });

  test("a short value yields the min clamp", () => {
    const textarea = document.createElement("textarea",);
    Object.defineProperty(textarea, "scrollHeight", { value: 20, writable: true, configurable: true, },);

    autoResize(textarea,);

    expect(textarea.style.height,).toBe("20px",);
  });

  test("scrollHeight of 0 does not produce negative height", () => {
    const textarea = document.createElement("textarea",);
    Object.defineProperty(textarea, "scrollHeight", { value: 0, writable: true, configurable: true, },);

    autoResize(textarea,);

    expect(textarea.style.height,).toBe("0px",);
  });
});
