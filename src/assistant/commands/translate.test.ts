/**
 * Translate Command Tests.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import { createLogger, } from "../../logger";
import { getCommand, } from "./registry";
import { LANGUAGES, } from "./translate";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("translate command", () => {
  it("is registered", () => {
    expect(getCommand("translate",),).toBeDefined();
  });

  it("registers the /tl alias", () => {
    expect(getCommand("tl",),).toBeDefined();
  });

  it("covers the supported language set", () => {
    expect(Object.keys(LANGUAGES,),).toEqual(
      ["en", "es", "fr", "de", "ja", "ko", "zh", "pt", "ru", "ar",],
    );
  });
});
