/**
 * Tests for views/character-edit-form (buildEditFormHtml).
 */
import { describe, expect, test, } from "bun:test";
import { buildEditFormHtml, type EditFormValues, } from "./character-edit-form";

const BASE: EditFormValues = {
  name: "Aria",
  desc: "A singer",
  systemPrompt: "You are Aria.",
  personality: "warm",
  welcome: "Hello!",
  scenario: "At the tavern",
  mesExample: "<user>hi</user>",
  postHistory: "keep it short",
  avatarHtml: '<img src="/api/assets/av1/thumb" />',
  avatarId: "av1",
  avatarRemoveBtn: '<button id="remove-avatar">Remove</button>',
  characterId: "actor-aria",
};

describe("views/character-edit-form", () => {
  test("renders core fields", () => {
    const html = buildEditFormHtml(BASE,);
    expect(html,).toContain("Aria",);
    expect(html,).toContain("A singer",);
    expect(html,).toContain("You are Aria.",);
    expect(html,).toContain("warm",);
    expect(html,).toContain("At the tavern",);
    expect(html,).toContain("keep it short",);
  });

  test("passes values through verbatim (escaping is the caller's job)", () => {
    const raw: EditFormValues = {
      ...BASE,
      name: "<script>alert(1)</script>",
      desc: "<b>bold</b>",
    };
    const html = buildEditFormHtml(raw,);
    expect(html,).toContain("<script>alert(1)</script>",);
    expect(html,).toContain("<b>bold</b>",);
  });

  test("includes internal traits section", () => {
    const html = buildEditFormHtml(BASE,);
    expect(html,).toContain("internal-traits-section",);
    expect(html,).toContain("add-aspiration",);
  });

  test("embeds avatar html and remove button", () => {
    const html = buildEditFormHtml(BASE,);
    expect(html,).toContain("/api/assets/av1/thumb",);
    expect(html,).toContain("remove-avatar",);
  });

  test("renders placeholder avatar when none", () => {
    const noAvatar: EditFormValues = {
      ...BASE,
      avatarHtml: "<span>👤</span>",
      avatarId: "",
      avatarRemoveBtn: "",
    };
    const html = buildEditFormHtml(noAvatar,);
    expect(html,).toContain("👤",);
    expect(html,).not.toContain("remove-avatar",);
  });
});
