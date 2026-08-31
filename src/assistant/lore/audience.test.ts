import { describe, expect, test, } from "bun:test";
import { isLoreVisibleTo, parseLoreScope, } from "./audience";
import type { ActorIdentity, LoreScope, } from "./audience";

/** Dark-elf identity — the classic scenario. */
const darkElf: ActorIdentity = {
  race: "dark elf",
  professions: ["mage",],
  locationId: "castle-underground",
};

/** Human identity — should NOT know dark-elf racial lore. */
const human: ActorIdentity = {
  race: "human",
  professions: ["farmer",],
  locationId: "castle-underground",
};

/**
 * @param scope
 */
function entry(scope: LoreScope | null,): { audienceScope: LoreScope | null } {
  return { audienceScope: scope, };
}

describe("parseLoreScope", () => {
  test("returns null for empty/invalid input", () => {
    expect(parseLoreScope(null,),).toBeNull();
    expect(parseLoreScope("",),).toBeNull();
    expect(parseLoreScope("not json",),).toBeNull();
    expect(parseLoreScope("{}",),).toBeNull(); // no subject block
  });

  test("parses a valid subject scope", () => {
    const scope = parseLoreScope(JSON.stringify({ subject: { kind: "race", race: "dark elf", }, },),);
    expect(scope?.subject?.kind,).toBe("race",);
  });
});

describe("isLoreVisibleTo — no scope", () => {
  test("entry with no audience scope is visible to everyone", () => {
    expect(isLoreVisibleTo(entry(null,), darkElf,),).toBeTrue();
    expect(isLoreVisibleTo(entry(null,), human,),).toBeTrue();
  });
});

describe("isLoreVisibleTo — world subject", () => {
  test("world lore applies to everyone (past + present state)", () => {
    const world: LoreScope = { subject: { kind: "world", }, };
    expect(isLoreVisibleTo(entry(world,), darkElf,),).toBeTrue();
    expect(isLoreVisibleTo(entry(world,), human,),).toBeTrue();
  });
});

describe("isLoreVisibleTo — race subject", () => {
  test("race lore visible to matching race", () => {
    const scope: LoreScope = { subject: { kind: "race", race: "dark elf", }, };
    expect(isLoreVisibleTo(entry(scope,), darkElf,),).toBeTrue();
  });

  test("race lore withheld from non-matching race (dark elves vs humans)", () => {
    const scope: LoreScope = { subject: { kind: "race", race: "dark elf", }, };
    expect(isLoreVisibleTo(entry(scope,), human,),).toBeFalse();
  });

  test("race matching is case-insensitive", () => {
    const scope: LoreScope = { subject: { kind: "race", race: "Dark Elf", }, };
    expect(isLoreVisibleTo(entry(scope,), darkElf,),).toBeTrue();
  });
});

describe("isLoreVisibleTo — profession subject", () => {
  test("profession lore visible to holder (mage knows fire spells)", () => {
    const scope: LoreScope = { subject: { kind: "profession", profession: "mage", }, };
    expect(isLoreVisibleTo(entry(scope,), darkElf,),).toBeTrue();
  });

  test("profession lore withheld from non-holder", () => {
    const scope: LoreScope = { subject: { kind: "profession", profession: "mage", }, };
    expect(isLoreVisibleTo(entry(scope,), human,),).toBeFalse();
  });
});

describe("isLoreVisibleTo — location subject", () => {
  test("location lore visible when present at the bound location", () => {
    const scope: LoreScope = {
      subject: { kind: "location", locationId: "castle-underground", },
    };
    expect(isLoreVisibleTo(entry(scope,), human,),).toBeTrue();
  });

  test("location lore hidden when elsewhere", () => {
    const scope: LoreScope = { subject: { kind: "location", locationId: "castle-underground", }, };
    const elsewhere: ActorIdentity = { ...human, locationId: "castle-surface", };
    expect(isLoreVisibleTo(entry(scope,), elsewhere,),).toBeFalse();
  });

  test("location lore uses the ancestry callback when provided", () => {
    const scope: LoreScope = { subject: { kind: "location", locationId: "region", }, };
    const inSubLocation: ActorIdentity = { ...human, locationId: "castle-underground", };
    const inScope = (_locId: string, scopeLocId: string,) => scopeLocId === "region";
    expect(isLoreVisibleTo(entry(scope,), inSubLocation, inScope,),).toBeTrue();
  });

  test("requires_presence:false reveals location lore even when away", () => {
    const scope: LoreScope = {
      subject: { kind: "location", locationId: "castle-underground", },
      requires_presence: false,
    };
    const away: ActorIdentity = { ...human, locationId: "castle-surface", };
    expect(isLoreVisibleTo(entry(scope,), away,),).toBeTrue();
  });
});

describe("isLoreVisibleTo — unknown subject", () => {
  test("future/unknown subjects are closed by default", () => {
    const scope = { subject: { kind: "hyperspace", }, } as unknown as LoreScope;
    expect(isLoreVisibleTo(entry(scope,), darkElf,),).toBeFalse();
  });
});
