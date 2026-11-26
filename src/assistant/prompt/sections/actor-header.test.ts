// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the actor-header prompt section. */
import { describe, expect, test, } from "bun:test";
import type { AssembleActor, AssembleContext, } from "../types";
import { actorHeaderSection, } from "./actor-header";

function ctx(actor: Partial<AssembleActor>,): AssembleContext {
  return {
    actor: {
      id: "actor-1",
      display_name: null,
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
      ...actor,
    },
  } as AssembleContext;
}

describe("actorHeaderSection", () => {
  test("always enabled", () => {
    expect(actorHeaderSection.enabled(ctx({},),),).toBe(true,);
  });

  test("blank actor builds nothing", async () => {
    expect(await actorHeaderSection.build(ctx({},),),).toEqual([],);
  });

  test("full card joins all parts into one system message", async () => {
    const out = await actorHeaderSection.build(
      ctx({
        display_name: "Lyra",
        description: "A sky pirate.",
        personality: "Brash.",
        appearance: "Tall with wind-tangled hair.",
        default_outfit: "sky-leathers",
        scenario: "Aboard the Zephyr.",
      },),
    );

    expect(out.length,).toBe(1,);
    expect(out[0]?.role,).toBe("system",);
    const content = out[0]?.content as string;
    expect(content,).toContain("You are Lyra.",);
    expect(content,).toContain("Description: A sky pirate.",);
    expect(content,).toContain("Personality: Brash.",);
    expect(content,).toContain("Appearance: Tall with wind-tangled hair.",);
    expect(content,).toContain("Outfit: sky-leathers",);
    expect(content,).toContain("Scenario: Aboard the Zephyr.",);
    expect(content,).toContain("<actor_header>",);
    expect(content,).not.toContain("<system>",);
  });

  test("skips fields that only repeat the description", async () => {
    const out = await actorHeaderSection.build(
      ctx({
        display_name: "Lyra",
        description: "A sky pirate.",
        personality: "A sky pirate.",
        appearance: "A sky pirate.",
      },),
    );

    const content = out[0]?.content as string;
    expect(content.match(/A sky pirate\./g,),).toHaveLength(1,);
  });

  test("partial card emits only the present parts", async () => {
    const out = await actorHeaderSection.build(ctx({ display_name: "Lyra", },),);
    expect(out,).toHaveLength(1,);
    expect(out[0]?.role,).toBe("system",);
    expect(out[0]?.content,).toContain("<actor_header>",);
    expect(out[0]?.content,).toContain("You are Lyra.",);
    expect(out[0]?.content,).toContain("</actor_header>",);
  });
});
