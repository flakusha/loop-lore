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
  appearance: "Tall with silver hair",
  defaultOutfit: "Travel cloak",
  welcome: "Hello!",
  scenario: "At the tavern",
  mesExample: "<user>hi</user>",
  postHistory: "keep it short",
  avatarHtml: '<img src="/api/assets/av1/thumb" />',
  avatarId: "av1",
  avatarRemoveBtn: '<button id="remove-avatar">Remove</button>',
  characterId: "actor-aria",
  contentRating: "nsfw_moderate",
  dataVersion: 4,
  avatarFocusX: 50,
  avatarFocusY: 50,
};

describe("views/character-edit-form", () => {
  test("renders avatar focus sliders with saved values", () => {
    const html = buildEditFormHtml({ ...BASE, avatarFocusX: 25, avatarFocusY: 80, },);
    expect(html,).toContain('id="edit-avatar-focus-x"',);
    expect(html,).toContain('id="edit-avatar-focus-y"',);
    expect(html,).toContain('value="25"',);
    expect(html,).toContain('value="80"',);
    expect(html,).toContain("updateAvatarFocusPreview",);
    expect(html,).toContain('id="char-data-version" value="4"',);
    expect(html,).toContain('id="char-avatar-id" value="av1"',);
  });

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

  test("includes actor sub-resource panels section", () => {
    const html = buildEditFormHtml(BASE,);
    // Outer panel container
    expect(html,).toContain("actor-panels-section",);
    // Per-panel test hooks and Alpine factory bindings
    expect(html,).toContain("actorLicensingFactory(actorId)",);
    expect(html,).toContain("actorEntitiesFactory(actorId, 'notes')",);
    expect(html,).toContain("actorEntitiesFactory(actorId, 'items')",);
    expect(html,).toContain("actorEntitiesFactory(actorId, 'lore-entries')",);
    expect(html,).toContain("actorSystemsFactory(actorId)",);
    expect(html,).toContain("actorTraitsFactory(actorId)",);
    expect(html,).toContain("actorEmotionAvatarsFactory(actorId)",);
    // characterId is escaped into the x-data scope (XSS safety on the actor id)
    expect(html,).toContain("x-data=\"{ actorId: 'actor-aria' }\"",);
    // Real panel bodies are inlined (not empty mount points)
    expect(html,).toContain("licensing-form",);
    expect(html,).toContain("entities-list",);
    expect(html,).toContain("systems-message",);
    expect(html,).toContain("traits-message",);
    expect(html,).toContain("emotion-avatars-message",);
  });

  test("escapes characterId in panel data scope", () => {
    const html = buildEditFormHtml({ ...BASE, characterId: "evil'); alert(1); ('", },);
    expect(html,).toContain("x-data=\"{ actorId: 'evil&#39;); alert(1); (&#39;' }\"",);
    expect(html,).not.toContain("x-data=\"{ actorId: 'evil'); alert(1); (' }\"",);
  });
});
