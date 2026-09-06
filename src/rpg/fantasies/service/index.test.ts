import { describe, expect, it, } from "bun:test";
import { FantasyService, } from "./index";

describe("rpg/fantasies/service/index (0% -> real)", () => {
  it("FantasyService prototype has createFantasy/getActorFantasies/attemptDiscovery", () => {
    expect(typeof FantasyService,).toBe("function",);
    expect(typeof FantasyService.prototype.createFantasy,).toBe("function",);
    expect(typeof FantasyService.prototype.attemptDiscovery,).toBe("function",);
    expect(typeof FantasyService.prototype.deleteFantasy,).toBe("function",);
  });
});
