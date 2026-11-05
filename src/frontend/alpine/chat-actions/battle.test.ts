import { describe, expect, test, } from "bun:test";
import { battleActionHandlers, } from "./battle";

interface PanelCtx {
  rendered: unknown[];
  renderBattlePanel(view: unknown,): void;
  connectGenerationSSE: (chatId: string,) => void;
}

function buildCtx(): PanelCtx {
  const ctx: PanelCtx = {
    rendered: [],
    connectGenerationSSE: () => {},
    renderBattlePanel(view,) {
      ctx.rendered.push(view,);
    },
  };

  return ctx;
}

const validBattle = {
  battle: {
    id: "b1",
    status: "active",
    round: 3,
    turnIndex: 1,
    combatants: [
      { id: "c1", name: "Hero", hp: 80, maxHp: 100, initiative: 12, },
      { id: "c2", name: "Ogre", hp: 150, maxHp: 150, initiative: 6, },
    ],
  },
};

describe("battleActionHandlers rendering actions", () => {
  test("battle-started renders the mapped view", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, validBattle, "chat-1",);
    expect(ctx.rendered,).toEqual([{
      id: "b1",
      status: "active",
      round: 3,
      turnIndex: 1,
      combatants: [
        { id: "c1", name: "Hero", hp: 80, maxHp: 100, initiative: 12, conditions: [], },
        { id: "c2", name: "Ogre", hp: 150, maxHp: 150, initiative: 6, conditions: [], },
      ],
      items: [],
      log: [],
      environmentalEffects: [],
    },],);
  });

  test("battle-started forwards usable items to the panel view", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, {
      battle: {
        ...validBattle.battle,
        items: [{ id: "i1", name: "Potion", quantity: 2, },],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { items: unknown[] };
    expect(view.items,).toEqual([{ id: "i1", name: "Potion", quantity: 2, },],);
  });

  test("battle-updated and battle-status route through the same renderer", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-updated"]!(ctx, validBattle, "chat-1",);
    battleActionHandlers["battle-status"]!(ctx, validBattle, "chat-1",);
    expect(ctx.rendered,).toHaveLength(2,);
  });

  test("drops combatants with malformed shapes", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, {
      battle: {
        id: "b2",
        status: "completed",
        round: 1,
        turnIndex: 0,
        combatants: [
          { id: "ok", name: "Fine", hp: 1, maxHp: 2, initiative: 0, },
          { id: "no-hp", name: "Broken", maxHp: 2, initiative: 0, },
          null,
          "junk",
          { id: "no-name", hp: 1, maxHp: 2, initiative: 1, },
        ],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { combatants: unknown[] };
    expect(view.combatants,).toEqual([{ id: "ok", name: "Fine", hp: 1, maxHp: 2, initiative: 0, conditions: [], },],);
  });

  test("delivers conditions and filters non-string condition entries", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, {
      battle: {
        ...validBattle.battle,
        combatants: [
          { ...validBattle.battle.combatants[0], conditions: ["stunned", "", 42, null, "poisoned",], },
        ],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { combatants: { conditions: unknown[] }[] };
    expect(view.combatants[0]?.conditions,).toEqual(["stunned", "poisoned",],);
  });

  test("defaults missing combatant conditions to an empty list", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, validBattle, "chat-1",);

    const view = ctx.rendered[0] as { combatants: { conditions: unknown[] }[] };
    expect(view.combatants[0]?.conditions,).toEqual([],);
  });

  test("delivers the battle log and drops malformed log entries", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-updated"]!(ctx, {
      battle: {
        ...validBattle.battle,
        log: [
          { type: "attack", damage: 7, critical: true, description: "Alice hits!", },
          { type: "bonus_action", description: "Alice recovers 3 HP.", },
          "junk",
          null,
          { type: 42, description: "no", },
          { type: "attack", damage: "seven", description: "no", },
          { type: "attack", damage: 1, description: 42, },
          { description: "missing type", },
        ],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { log: unknown[] };
    expect(view.log,).toEqual([
      { type: "attack", damage: 7, critical: true, description: "Alice hits!", },
      { type: "bonus_action", description: "Alice recovers 3 HP.", },
    ],);
  });

  test("keeps entries with a well-formed roll and drops malformed rolls", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-updated"]!(ctx, {
      battle: {
        ...validBattle.battle,
        log: [
          {
            type: "attack",
            description: "Alice hits!",
            roll: { natural: 20, modifier: 3, total: 23, dc: 16, hit: true, criticalMiss: false, },
          },
          {
            type: "attack",
            description: "Bob misses!",
            roll: { natural: 4, modifier: 1, total: 5, dc: "16", hit: false, criticalMiss: false, },
          },
          {
            type: "attack",
            description: "Cleo hits!",
            roll: { natural: 11, modifier: 2, total: 13, dc: 14, hit: true, criticalMiss: false, },
          },
          {
            type: "attack",
            description: "Dan whiffs!",
            roll: { natural: 1, modifier: 0, total: 1, dc: 14, hit: "false", criticalMiss: true, },
          },
        ],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { log: unknown[] };
    expect(view.log,).toEqual([
      {
        type: "attack",
        description: "Alice hits!",
        roll: { natural: 20, modifier: 3, total: 23, dc: 16, hit: true, criticalMiss: false, },
      },
      {
        type: "attack",
        description: "Cleo hits!",
        roll: { natural: 11, modifier: 2, total: 13, dc: 14, hit: true, criticalMiss: false, },
      },
    ],);
  });

  test("defaults a missing battle log to an empty list", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, validBattle, "chat-1",);

    const view = ctx.rendered[0] as { log: unknown[] };
    expect(view.log,).toEqual([],);
  });

  test("ignores payloads with an invalid battle shape", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, null, "chat-1",);
    battleActionHandlers["battle-started"]!(ctx, { battle: "nope", }, "chat-1",);
    battleActionHandlers["battle-started"]!(ctx, {
      battle: { id: "b3", status: "weird", round: 1, turnIndex: 0, combatants: [], },
    }, "chat-1",);

    battleActionHandlers["battle-started"]!(ctx, {
      battle: { id: 42, status: "active", round: 1, turnIndex: 0, combatants: [], },
    }, "chat-1",);

    battleActionHandlers["battle-started"]!(ctx, {
      battle: { id: "b4", status: "active", round: "1", turnIndex: 0, combatants: [], },
    }, "chat-1",);

    battleActionHandlers["battle-started"]!(ctx, {
      battle: { id: "b5", status: "active", round: 1, turnIndex: 0, combatants: "[]", },
    }, "chat-1",);

    expect(ctx.rendered,).toEqual([],);
  });

  test("battle-ended clears the panel with null", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-ended"]!(ctx, null, "chat-1",);
    expect(ctx.rendered,).toEqual([null,],);
  });

  test("forwards action economy when the backend delivers counters", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, {
      battle: {
        ...validBattle.battle,
        combatants: [
          { ...validBattle.battle.combatants[0], actions: 1, bonusActions: 0, reactions: 1, },
        ],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { combatants: Record<string, unknown>[] };
    expect(view.combatants[0],).toMatchObject({ actions: 1, bonusActions: 0, reactions: 1, },);
  });

  test("drops non-numeric economy counters", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, {
      battle: {
        ...validBattle.battle,
        combatants: [
          { ...validBattle.battle.combatants[0], actions: "1", bonusActions: null, },
        ],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { combatants: Record<string, unknown>[] };
    expect(view.combatants[0]?.actions,).toBeUndefined();
    expect(view.combatants[0]?.bonusActions,).toBeUndefined();
  });

  test("delivers environmental effects and drops malformed entries", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, {
      battle: {
        ...validBattle.battle,
        environmentalEffects: [{ name: "Weather: rain", }, "junk", null, { label: 42, },],
      },
    }, "chat-1",);

    const view = ctx.rendered[0] as { environmentalEffects: unknown[] };
    expect(view.environmentalEffects,).toEqual([{ name: "Weather: rain", },],);
  });

  test("defaults missing environmental effects to an empty list", () => {
    const ctx = buildCtx();
    battleActionHandlers["battle-started"]!(ctx, validBattle, "chat-1",);

    const view = ctx.rendered[0] as { environmentalEffects: unknown[] };
    expect(view.environmentalEffects,).toEqual([],);
  });
});
