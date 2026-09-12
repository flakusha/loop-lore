/**
 * Command Registry Tests — tiered access + role hierarchy.
 */
import { describe, expect, it, } from "bun:test";
import { ChatParticipantRole, } from "../../db/enums";
import {
  getCommand,
  getCommandRequirement,
  listCommands,
  registerCommand,
  satisfiesRole,
} from "./registry";

describe("satisfiesRole", () => {
  it("orders observer < member < owner", () => {
    expect(satisfiesRole(ChatParticipantRole.Owner, ChatParticipantRole.Member,),).toBe(true,);
    expect(satisfiesRole(ChatParticipantRole.Member, ChatParticipantRole.Member,),).toBe(true,);
    expect(satisfiesRole(ChatParticipantRole.Observer, ChatParticipantRole.Member,),).toBe(false,);
    expect(satisfiesRole(ChatParticipantRole.Observer, ChatParticipantRole.Observer,),).toBe(true,);
    expect(satisfiesRole(ChatParticipantRole.Member, ChatParticipantRole.Owner,),).toBe(false,);
  });

  // Regression: migration 007 added `gm` to ChatParticipantRole. The ROLE_PRIORITY
  // literal must cover it without silently widening owner-gated commands
  // (attack/battle/create/debug/heal register `requiredRole: "owner"`).
  it("gm is a moderation role, not a command-gating tier", () => {
    expect(satisfiesRole(ChatParticipantRole.Gm, ChatParticipantRole.Gm,),).toBe(true,);
    expect(satisfiesRole(ChatParticipantRole.Gm, ChatParticipantRole.Member,),).toBe(true,);
    expect(satisfiesRole(ChatParticipantRole.Gm, ChatParticipantRole.Owner,),).toBe(false,);
    expect(satisfiesRole(ChatParticipantRole.Member, ChatParticipantRole.Gm,),).toBe(true,);
    expect(satisfiesRole(ChatParticipantRole.Owner, ChatParticipantRole.Gm,),).toBe(true,);
  });
});

describe("registerCommand (tiered access)", () => {
  it("records requiredRole metadata without affecting the handler", () => {
    registerCommand("tiered-test", () => ({ handled: true, }), {
      requiredRole: ChatParticipantRole.Owner,
    },);

    expect(getCommandRequirement("tiered-test",),).toBe(ChatParticipantRole.Owner,);
    expect(getCommand("tiered-test",),).toBeDefined();
  });

  it("returns undefined requirement for unrestricted commands", () => {
    registerCommand("open-test", () => ({ handled: true, }),);

    expect(getCommandRequirement("open-test",),).toBeUndefined();
    expect(listCommands(),).toContain("open-test",);
  });
});
