// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for resolveMode's cascade + GM-role-override paths
 * (src/generation/auto-gen/resolve-mode.ts). Neither path touches the DB:
 * cascade re-entry short-circuits on the actor id, the override reads only
 * the chat row subset + config templates. Uses in-memory stubs in the
 * colocated-test style of resolve-actor-rotation.test.ts.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveSystemPrompt, } from "../../prompts";
import type { GenDeps, } from "./deps";
import { resolveMode, } from "./resolve-mode";

/** Minimal config: templates only, the one surface resolveMode reads. */
function makeConfig(): Config {
  return { templates: { llm: { systemPrompts: {}, }, }, } as unknown as Config;
}

/** Cascade/override paths never touch db or deps; stubs only satisfy types. */
function call(chat: Parameters<typeof resolveMode>[0]["chat"], extra = {},) {
  return resolveMode({
    d: {} as unknown as GenDeps,
    database: {} as unknown as Kysely<DB>,
    config: makeConfig(),
    chatId: "chat-1",
    parentMessageId: null,
    userId: "user-1",
    chat,
    ...extra,
  },);
}

describe("resolveMode cascade + role-override paths (T2)", () => {
  test("cascade re-entry returns unhandled without an override", async () => {
    const result = await call(undefined, { _cascadeActorId: "actor-1", _cascadeDepth: 0, },);
    expect(result,).toEqual({ handled: false, systemPromptOverride: undefined, },);
  });

  test("missing chat row returns unhandled without an override", async () => {
    expect(await call(undefined,),).toEqual({ handled: false, systemPromptOverride: undefined, },);
  });

  test("gm assistantRole resolves the config GM prompt as override", async () => {
    const config = makeConfig();
    const result = await resolveMode({
      d: {} as unknown as GenDeps,
      database: {} as unknown as Kysely<DB>,
      config,
      chatId: "chat-1",
      parentMessageId: null,
      userId: "user-1",
      chat: { type: "direct", mode: "battle", gm_config: JSON.stringify({ assistantRole: "gm", },), },
    },);

    expect(result,).toEqual({
      handled: false,
      systemPromptOverride: resolveSystemPrompt(config.templates.llm, "gm",),
    },);
  });

  test("non-gm assistantRole returns unhandled without an override", async () => {
    const result = await call({
      type: "direct",
      mode: "battle",
      gm_config: JSON.stringify({ assistantRole: "helper", },),
    },);

    expect(result,).toEqual({ handled: false, systemPromptOverride: undefined, },);
  });
});
