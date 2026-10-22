// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Registry exhaustiveness: every ErrorCode maps to a status. */

import { describe, expect, test, } from "bun:test";
import { ErrorCode, } from "../routes/http-utils/status";
import { CODE_TO_STATUS, } from "./error-codes";

describe("CODE_TO_STATUS", () => {
  test("covers every ErrorCode", () => {
    const codes = Object.values(ErrorCode,);
    expect(codes.length,).toBeGreaterThan(0,);
    for (const code of codes) {
      expect(CODE_TO_STATUS[code],).toBeDefined();
    }

    expect(Object.keys(CODE_TO_STATUS,),).toHaveLength(codes.length,);
  });
});
