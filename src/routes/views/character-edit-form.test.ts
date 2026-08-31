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
  contentRating: "nsfw_moderate",
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

  test("renders content rating selector with current rating selected", () => {
    const html = buildEditFormHtml(BASE,);
    expect(html,).toContain("edit-content-rating",);
    expect(html,).toContain('value="nsfw_moderate" selected',);
    expect(html,).toContain('value="nsfw_extreme"',);
  });

  test("escapes user-controlled fields (TASK-character-edit-form-renders-unescaped-user-fields-stored-xss)", () => {
    const raw: EditFormValues = {
      ...BASE,
      name: "<script>alert(1)</script>",
      desc: "<b>bold</b>",
      characterId: "evil'); alert(1); ('",
    };
    const html = buildEditFormHtml(raw,);
    // Raw script tag must NOT appear verbatim.
    expect(html,).not.toContain("<script>alert(1)</script>",);
    // Each dangerous char must be HTML-encoded.
    expect(html,).toContain("&lt;script&gt;alert(1)&lt;/script&gt;",);
    expect(html,).toContain("&lt;b&gt;bold&lt;/b&gt;",);
    // characterId inside an onclick string must not break out of the quote.
    expect(html,).toContain("evil&#39;); alert(1); (&#39;",);
    expect(html,).not.toContain("evil'); alert(1); ('",);
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
