// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { battleRoutes, } from "./index";
import { moraleRoutes, } from "./morale";
import { npcRoutes, } from "./npc";
import { resolutionRoutes, } from "./resolution";
import { socialRoutes, } from "./social";
import { weatherRoutes, } from "./weather";

const OPTS = { database: {} as never, config: {} as never, };

type Routable = { handle: (req: Request,) => Promise<Response> };

/** Shared POST harness: every battle test below posts JSON through it. */
async function post(app: Elysia, url: string, body: unknown,): Promise<Response> {
  return (app as unknown as Routable).handle(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** Typed JSON read: call sites pass the expected shape, no member casts. */
async function json<T,>(res: Response,): Promise<T> {
  return res.json() as Promise<T>;
}

interface MoraleBody {
  level: string;
  value: number;
  modifiers?: unknown[];
  broke?: boolean;
  effects?: unknown[];
}

interface NpcDecisionBody {
  type: string;
  confidence: number;
  reasoning: string;
}

interface NpcMemoryBody {
  battleId: string;
  outcome: string;
  opponents: string[];
}

interface NpcSurrenderBody {
  surrender: boolean;
  confidence: number;
}

interface DamageBody {
  totalDamage: number;
  type: string;
  wasCritical: boolean;
}

interface AttackBody {
  hit: boolean;
  narration: string;
}

interface DefenseBody {
  success: boolean;
}

interface RoundBody {
  actions: unknown[];
  summary: string;
}

interface SocialBody {
  action: string;
  success: boolean;
  moraleEffect: number;
  surrenderChance?: number;
  canSurrender?: boolean;
}

interface VisibilityBody {
  visibility: number;
}

const MORALE_STATE = {
  characterId: "c1",
  value: 50,
  level: "steady",
  modifiers: [],
  lastUpdated: new Date().toISOString(),
};

const PERSONALITY = {
  aggression: 80,
  caution: 20,
  loyalty: 50,
  intelligence: 50,
  courage: 60,
};

describe("moraleRoutes", () => {
  const app = moraleRoutes(OPTS,);

  test("compute returns the level for the value", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/compute", { value: 50, },);
    expect(res.status,).toBe(200,);
    const body = await json<MoraleBody>(res,);
    expect(body.level,).toBe("steady",);
    expect(body.value,).toBe(50,);
  });

  test("compute maps a broken value", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/compute", { value: 5, },);
    expect(res.status,).toBe(200,);
    expect((await json<MoraleBody>(res,)).level,).toBe("broken",);
  });

  test("apply merges the modifier into the state", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/apply", {
      state: MORALE_STATE,
      modifier: { reason: "rallied", value: 10, duration: 3, appliedAt: new Date().toISOString(), },
    },);
    expect(res.status,).toBe(200,);
    const body = await json<MoraleBody>(res,);
    expect(body.value,).toBe(60,);
    expect(body.level,).toBe("steady",);
    expect(body.modifiers?.length,).toBe(1,);
  });

  test("break reports effects for broken morale", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/break", {
      state: { ...MORALE_STATE, value: 5, level: "broken", },
    },);
    expect(res.status,).toBe(200,);
    const body = await json<MoraleBody>(res,);
    expect(body.broke,).toBeTrue();
    expect((body.effects?.length ?? 0) > 0,).toBeTrue();
  });

  test("break is clean for steady morale", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/break", {
      state: MORALE_STATE,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<MoraleBody>(res,);
    expect(body.broke,).toBeFalse();
    expect(body.effects,).toEqual([],);
  });

  test("null body surfaces a 500", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/apply", null,);
    expect(res.status,).toBe(500,);
  });
});

describe("npcRoutes", () => {
  const app = npcRoutes(OPTS,);

  test("decision returns a typed choice with confidence", async () => {
    const res = await post(app, "http://localhost/api/battle/npc/decision", {
      personality: PERSONALITY,
      currentHealth: 100,
      maxHealth: 100,
      enemyCount: 1,
      allyCount: 2,
      battleMemories: [],
    },);
    expect(res.status,).toBe(200,);
    const body = await json<NpcDecisionBody>(res,);
    expect(["attack", "defend", "flee", "negotiate", "use_item", "special",],).toContain(body.type,);
    expect(body.confidence >= 0 && body.confidence <= 100,).toBeTrue();
    expect(typeof body.reasoning,).toBe("string",);
  });

  test("memory records the battle outcome", async () => {
    const res = await post(app, "http://localhost/api/battle/npc/memory", {
      battleId: "b1",
      outcome: "victory",
      opponents: ["orc",],
      opponentLevel: 3,
      npcLevel: 5,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<NpcMemoryBody>(res,);
    expect(body.battleId,).toBe("b1",);
    expect(body.outcome,).toBe("victory",);
    expect(body.opponents,).toEqual(["orc",],);
  });

  test("high-courage NPC never surrenders", async () => {
    const res = await post(app, "http://localhost/api/battle/npc/surrender", {
      personality: { ...PERSONALITY, courage: 95, },
      currentHealth: 5,
      maxHealth: 100,
      battleMemories: [],
    },);
    expect(res.status,).toBe(200,);
    const body = await json<NpcSurrenderBody>(res,);
    expect(body.surrender,).toBeFalse();
    expect(body.confidence,).toBe(90,);
  });

  test("null body surfaces a 500", async () => {
    const res = await post(app, "http://localhost/api/battle/npc/decision", null,);
    expect(res.status,).toBe(500,);
  });
});

describe("resolutionRoutes", () => {
  const app = resolutionRoutes(OPTS,);

  test("damage totals dice plus modifiers", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/damage", {
      baseDamage: "2d6+3",
      modifiers: [{ source: "rage", value: 2, },],
      isCritical: false,
      damageType: "physical",
    },);
    expect(res.status,).toBe(200,);
    const body = await json<DamageBody>(res,);
    expect(body.totalDamage >= 1,).toBeTrue();
    expect(body.type,).toBe("physical",);
    expect(body.wasCritical,).toBeFalse();
  });

  test("damage with invalid notation returns zero, not an error", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/damage", {
      baseDamage: "zzz",
      modifiers: [],
    },);
    expect(res.status,).toBe(200,);
    expect((await json<DamageBody>(res,)).totalDamage,).toBe(0,);
  });

  test("attack echoes hit state and narration", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/attack", {
      attackBonus: 5,
      targetAC: 10,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<AttackBody>(res,);
    expect(typeof body.hit,).toBe("boolean",);
    expect(body.narration,).toContain("Roll:",);
  });

  test("defense rolls against the incoming attack", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/defense", {
      defenseBonus: 4,
      incomingAttack: 12,
    },);
    expect(res.status,).toBe(200,);
    expect(typeof (await json<DefenseBody>(res,)).success,).toBe("boolean",);
  });

  test("round processes every combatant in order", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/round", {
      combatants: [
        { id: "a", attackBonus: 5, defenseBonus: 2, maxHP: 30, },
        { id: "b", attackBonus: 4, defenseBonus: 3, maxHP: 30, },
      ],
      currentHP: { a: 30, b: 30, },
    },);
    expect(res.status,).toBe(200,);
    const body = await json<RoundBody>(res,);
    expect(body.actions.length,).toBe(2,);
    expect(body.summary,).toBe("Processed 2 actions",);
  });

  test("null body surfaces a 500", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/damage", null,);
    expect(res.status,).toBe(500,);
  });
});

describe("socialRoutes", () => {
  const app = socialRoutes(OPTS,);

  test("intimidate succeeds with overwhelming bonus", async () => {
    const res = await post(app, "http://localhost/api/battle/social/intimidate", {
      attackerLevel: 20,
      attackerIntimidation: 100,
      targetLevel: 1,
      targetMorale: MORALE_STATE,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<SocialBody>(res,);
    expect(body.action,).toBe("intimidate",);
    expect(body.success,).toBeTrue();
    expect(body.moraleEffect < 0,).toBeTrue();
  });

  test("taunt lands on aggressive targets", async () => {
    const res = await post(app, "http://localhost/api/battle/social/taunt", {
      attackerCharisma: 100,
      targetMorale: MORALE_STATE,
      targetPersonality: "aggressive",
    },);
    expect(res.status,).toBe(200,);
    const body = await json<SocialBody>(res,);
    expect(body.action,).toBe("taunt",);
    expect(body.success,).toBeTrue();
  });

  test("surrender is possible at low morale", async () => {
    const res = await post(app, "http://localhost/api/battle/social/surrender", {
      targetMorale: { ...MORALE_STATE, value: 20, level: "broken", },
      attackerReputation: 50,
      targetHealthPercent: 25,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<SocialBody>(res,);
    expect(body.canSurrender,).toBeTrue();
    expect((body.surrenderChance ?? 0) > 0,).toBeTrue();
  });

  test("surrender is refused at high morale", async () => {
    const res = await post(app, "http://localhost/api/battle/social/surrender", {
      targetMorale: MORALE_STATE,
      attackerReputation: 50,
      targetHealthPercent: 100,
    },);
    expect(res.status,).toBe(200,);
    expect((await json<SocialBody>(res,)).canSurrender,).toBeFalse();
  });

  test("rally boosts ally morale", async () => {
    const res = await post(app, "http://localhost/api/battle/social/rally", {
      leaderCharisma: 20,
      leaderLevel: 5,
      allyMorale: MORALE_STATE,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<SocialBody>(res,);
    expect(body.action,).toBe("rally",);
    expect(body.success,).toBeTrue();
  });

  test("inspire boosts ally morale", async () => {
    const res = await post(app, "http://localhost/api/battle/social/inspire", {
      leaderCharisma: 20,
      leaderInspiration: 10,
      allyMorale: MORALE_STATE,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<SocialBody>(res,);
    expect(body.action,).toBe("inspire",);
    expect(body.success,).toBeTrue();
  });

  test("demoralize reduces target morale", async () => {
    const res = await post(app, "http://localhost/api/battle/social/demoralize", {
      attackerIntimidation: 100,
      attackerLevel: 20,
      targetMorale: MORALE_STATE,
    },);
    expect(res.status,).toBe(200,);
    const body = await json<SocialBody>(res,);
    expect(body.action,).toBe("demoralize",);
    expect(body.success,).toBeTrue();
  });

  test("null body surfaces a 500", async () => {
    const res = await post(app, "http://localhost/api/battle/social/intimidate", null,);
    expect(res.status,).toBe(500,);
  });
});

describe("weatherRoutes", () => {
  const app = weatherRoutes(OPTS,);

  test("modifiers resolve for clear open terrain", async () => {
    const res = await post(app, "http://localhost/api/battle/weather/modifiers", {
      weather: "clear",
      terrain: "open",
    },);
    expect(res.status,).toBe(200,);
  });

  test("visibility drops in fog", async () => {
    const res = await post(app, "http://localhost/api/battle/weather/visibility", {
      weather: "fog",
      timeOfDay: 12,
    },);
    expect(res.status,).toBe(200,);
    expect((await json<VisibilityBody>(res,)).visibility,).toBe(30,);
  });

  test("visibility halves at night", async () => {
    const res = await post(app, "http://localhost/api/battle/weather/visibility", {
      weather: "clear",
      timeOfDay: 22,
    },);
    expect(res.status,).toBe(200,);
    expect((await json<VisibilityBody>(res,)).visibility,).toBe(50,);
  });

  test("hazard returns 200 with a hazard or null", async () => {
    const res = await post(app, "http://localhost/api/battle/weather/hazard", {
      terrain: "open",
      weather: "clear",
    },);
    expect(res.status,).toBe(200,);
  });

  test("null body surfaces a 500", async () => {
    const res = await post(app, "http://localhost/api/battle/weather/modifiers", null,);
    expect(res.status,).toBe(500,);
  });
});

describe("battleRoutes barrel", () => {
  const app = new Elysia({ name: "test-battle-barrel", },).use(battleRoutes(OPTS,),);

  test("morale compute is reachable through the barrel", async () => {
    const res = await post(app, "http://localhost/api/battle/morale/compute", { value: 90, },);
    expect(res.status,).toBe(200,);
    expect((await json<MoraleBody>(res,)).level,).toBe("inspired",);
  });

  test("npc memory is reachable through the barrel", async () => {
    const res = await post(app, "http://localhost/api/battle/npc/memory", {
      battleId: "bb",
      outcome: "draw",
      opponents: [],
      opponentLevel: 1,
      npcLevel: 1,
    },);
    expect(res.status,).toBe(200,);
    expect((await json<NpcMemoryBody>(res,)).battleId,).toBe("bb",);
  });

  test("resolution damage is reachable through the barrel", async () => {
    const res = await post(app, "http://localhost/api/battle/resolution/damage", {
      baseDamage: "1d4",
      modifiers: [],
    },);
    expect(res.status,).toBe(200,);
  });

  test("social intimidate is reachable through the barrel", async () => {
    const res = await post(app, "http://localhost/api/battle/social/intimidate", {
      attackerLevel: 1,
      attackerIntimidation: 1,
      targetLevel: 10,
      targetMorale: MORALE_STATE,
    },);
    expect(res.status,).toBe(200,);
    expect((await json<SocialBody>(res,)).success,).toBeFalse();
  });

  test("weather visibility is reachable through the barrel", async () => {
    const res = await post(app, "http://localhost/api/battle/weather/visibility", {
      weather: "rain",
      timeOfDay: 12,
    },);
    expect(res.status,).toBe(200,);
    expect((await json<VisibilityBody>(res,)).visibility,).toBe(70,);
  });
});
