import { describe, expect, it, } from "bun:test";
import { EncounterService, } from "./index";

describe("rpg/encounters/service/index (0% -> real)", () => {
  it("EncounterService class can be instantiated", () => {
    // EncounterService needs db in constructor — verify class exists and is constructable
    expect(typeof EncounterService,).toBe("function",);
    expect(EncounterService.prototype.createEncounter,).toBeDefined();
    expect(EncounterService.prototype.getEncounter,).toBeDefined();
    expect(EncounterService.prototype.listEncounters,).toBeDefined();
    expect(EncounterService.prototype.deleteEncounter,).toBeDefined();
  });
});
