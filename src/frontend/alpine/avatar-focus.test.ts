// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { avatarFocusPosition, avatarFocusStyle, } from "./avatar-focus";

describe("avatarFocusStyle", () => {
  test("defaults to exact centering when values are absent", () => {
    expect(avatarFocusStyle(),).toBe("object-position: 50% 50%",);
    expect(avatarFocusStyle({},),).toBe("object-position: 50% 50%",);
  });

  test("falls back to centering for non-finite values", () => {
    expect(avatarFocusStyle({ focusX: null, focusY: null, },),).toBe("object-position: 50% 50%",);
    expect(avatarFocusStyle({ focusX: Number.NaN, focusY: Number.NaN, },),).toBe(
      "object-position: 50% 50%",
    );
    expect(avatarFocusStyle({ focusX: Number.NaN, focusY: 20, },),).toBe("object-position: 50% 20%",);
  });

  test("clamps each axis independently into 0-100", () => {
    expect(avatarFocusStyle({ focusX: 150, focusY: -20, },),).toBe("object-position: 100% 0%",);
    expect(avatarFocusStyle({ focusX: -5, focusY: 999, },),).toBe("object-position: 0% 100%",);
  });

  test("renders custom focus percentages verbatim", () => {
    expect(avatarFocusStyle({ focusX: 25, focusY: 80, },),).toBe("object-position: 25% 80%",);
    expect(avatarFocusStyle({ focusX: 0, focusY: 100, },),).toBe("object-position: 0% 100%",);
  });

  test("exposes the bare object-position value for CSSOM assignment", () => {
    expect(avatarFocusPosition(),).toBe("50% 50%",);
    expect(avatarFocusPosition({ focusX: 25, focusY: 80, },),).toBe("25% 80%",);
    expect(avatarFocusPosition({ focusX: 150, focusY: -20, },),).toBe("100% 0%",);
  });
});
