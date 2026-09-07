// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { log, } from "./log";

createLogger({ level: "error", },);

describe("battle log", () => {
  test("returns a module-bound logger", () => {
    const logger = log();
    expect(logger,).toBeDefined();
    expect(typeof logger.debug,).toBe("function",);
    expect(typeof logger.info,).toBe("function",);
    expect(typeof logger.warn,).toBe("function",);
    expect(typeof logger.error,).toBe("function",);
  });

  test("child loggers accept log calls without throwing", () => {
    expect(() => log().debug("battle test debug",)).not.toThrow();
    expect(() => log().child({ module: "battle", },)).not.toThrow();
  });
});
