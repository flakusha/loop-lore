/**
 * Tests for view-route content negotiation.
 *
 * Resource contract: OWNS NOTHING. Parses caller-supplied Accept strings;
 * produces view-models from caller-supplied data. Must never gain Date.now(),
 * Math.random(), or any real network call — any of those would make the suite
 * order- or run-dependent under parallel execution.
 */
import { describe, expect, test, } from "bun:test";
import { jsonViewModelResponse, wantsJsonViewModel, } from "./negotiate";

describe("views/negotiate — wantsJsonViewModel", () => {
  test("no Accept header keeps the markup representation", () => {
    expect(wantsJsonViewModel({ accept: null, },),).toBe(false,);
  });

  test("an any-media wildcard keeps the markup representation", () => {
    expect(wantsJsonViewModel({ accept: "*/*", },),).toBe(false,);
  });

  test("an explicit text/html keeps the markup representation", () => {
    expect(wantsJsonViewModel({ accept: "text/html", },),).toBe(false,);
  });

  test("a browser Accept list keeps the markup representation", () => {
    expect(wantsJsonViewModel({ accept: "text/html,application/xhtml+xml,*/*;q=0.8", },),).toBe(false,);
  });

  test("explicit application/json selects JSON", () => {
    expect(wantsJsonViewModel({ accept: "application/json", },),).toBe(true,);
  });

  test("text/html outranks a wildcard application/json with q=0.9", () => {
    expect(wantsJsonViewModel({ accept: "text/html, application/json;q=0.9", },),).toBe(false,);
  });

  test("application/json outranks a lower-q text/html", () => {
    expect(wantsJsonViewModel({ accept: "application/json, text/html;q=0.5", },),).toBe(true,);
  });

  test("application/json beats a wildcard html preference", () => {
    expect(wantsJsonViewModel({ accept: "application/json, */*;q=0.8", },),).toBe(true,);
  });

  test("application/json;q=0 rejects the JSON representation", () => {
    expect(wantsJsonViewModel({ accept: "application/json;q=0, text/html", },),).toBe(false,);
  });

  test("an unrelated media type is ignored", () => {
    expect(wantsJsonViewModel({ accept: "image/png", },),).toBe(false,);
  });
});

describe("views/negotiate — jsonViewModelResponse", () => {
  test("serializes the view-model with an application/json content type", async () => {
    const res = jsonViewModelResponse({ characters: [{ id: "actor-1", },], },);

    expect(res.headers.get("content-type",),).toBe("application/json",);
    expect(await res.json(),).toEqual({ characters: [{ id: "actor-1", },], },);
  });
});
