import { describe, expect, test, } from "bun:test";
import { battleActionHandlers, } from "./battle";

interface PanelCtx {
  rendered: unknown[];
  renderBattlePanel(view: unknown,): void;
}

function buildCtx(): PanelCtx {
  const ctx: PanelCtx = { rendered: [], renderBattlePanel(view,) { ctx.rendered.push(view,); }, };
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
        { id: "c1", name: "Hero", hp: 80, maxHp: 100, initiative: 12, },
        { id: "c2", name: "Ogre", hp: 150, maxHp: 150, initiative: 6, },
      ],
    }],);
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
    expect(view.combatants,).toEqual([{ id: "ok", name: "Fine", hp: 1, maxHp: 2, initiative: 0, },],);
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
    expect(ctx.rendered,).toEqual([null],);
  });
});
