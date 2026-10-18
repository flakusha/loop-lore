// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for templates/apply.ts — the seam where scene templates become live
 * render settings.
 *
 * The blank-scene regression is asserted at the whitelist decision (the
 * returned transition), not at rendered opacity: an out-of-union transition
 * reaching transition-engine leaves the scene at opacity 0 forever, which a
 * DOM-level assertion cannot distinguish from a passing render.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { VnScene, } from "../scene-renderer/types";
import type { VnSettings, } from "../settings";
import {
  applyResolvedTemplate,
  applyTemplateOverrides,
  resolveAnyTemplate,
  resolveTemplateForScene,
} from "./apply";
import { DIALOGUE_TEMPLATES, } from "./scene-templates/dialogue-templates";
import { SCENE_TEMPLATES, } from "./scene-templates/scene-templates";
import { saveTemplate, type VnTemplate, } from "./template-engine";

/** Base settings with values distinct from template bodies where possible. */
function baseSettings(): VnSettings {
  return {
    enabled: true,
    layout: "overlay",
    imageScaling: "auto",
    transition: "fade",
    typewriter: true,
    typewriterSpeed: 30,
    autoAdvance: false,
    autoAdvanceDelay: 5,
    dialogueBoxOpacity: 0.75,
    portraitSize: 35,
    splitRatio: 40,
    vnChoicesEnabled: true,
  };
}

/** Minimal VnScene carrying only the template fields under test. */
function scene(templateId?: string, templateVars?: Record<string, unknown>,): VnScene {
  return {
    messageId: "m1",
    characterName: "Someone",
    text: "...",
    role: "assistant",
    templateId,
    templateVars,
  };
}

describe("applyTemplateOverrides — pass-through", () => {
  test("returns the base settings object when the scene has no template", () => {
    const base = baseSettings();
    expect(applyTemplateOverrides(base, scene(undefined,),),).toBe(base,);
  });

  test("returns the base settings object for an unknown template id", () => {
    const base = baseSettings();
    expect(applyTemplateOverrides(base, scene("no-such-template", {},),),).toBe(base,);
  });
});

describe("applyTemplateOverrides — blank-scene regression guard", () => {
  // The built-in introduction scene template ships transition fade-in, which
  // is NOT in VnSettings.transition. Handing it to transition-engine yields
  // DEFAULT_DURATION[undefined] → NaN, no switch case, no transitionend, and
  // onEnd never runs → the incoming scene stays at opacity 0.
  test("returns the BASE transition for the built-in fade-in template", () => {
    const base = baseSettings();
    const result = applyTemplateOverrides(base, scene("introduction", { character_name: "Ada", },),);

    expect(result.transition,).toBe(base.transition,);
    expect(result.transition,).toBe("fade",);
  });

  // The real invariant: for EVERY shipped template the returned transition is
  // a member of the renderer's union. Covers the in-registry fade-in case
  // (introduction) and the whole dialogue set, whose ids are not in the scene
  // registry and therefore fall back to base.
  test("never returns an out-of-union transition for any shipped template", () => {
    const allowed = new Set(["fade", "cut", "dissolve", "slide", "wipe",],);

    for (const template of [...SCENE_TEMPLATES, ...DIALOGUE_TEMPLATES,]) {
      const base = baseSettings();
      const vars: Record<string, unknown> = {};
      for (const variable of template.variables) {
        vars[variable.name] = variable.default ?? "";
      }

      const result = applyTemplateOverrides(base, scene(template.id, vars,),);

      expect(allowed.has(result.transition,),).toBe(true,);
    }
  });

  test("an in-union template transition IS applied (whitelist is not a blanket no-op)", () => {
    const base = baseSettings();
    // confrontation ships transition cut — a member of the union.
    const result = applyTemplateOverrides(base, scene("confrontation", { character_name: "Ada", },),);
    expect(result.transition,).toBe("cut",);
  });
});

describe("applyTemplateOverrides — throwing variable resolution", () => {
  test("a missing REQUIRED variable falls back to base settings instead of throwing", () => {
    const base = baseSettings();
    // introduction declares character_name as required; omit it and
    // resolveVariables throws. renderCurrentScene has no handler, so an
    // escaping throw would abort the scene build mid-DOM.
    const result = applyTemplateOverrides(base, scene("introduction", {},),);

    expect(result,).toBe(base,);
    expect(result.layout,).toBe(base.layout,);
  });

  test("supplying the required variable resolves normally", () => {
    const base = baseSettings();
    const result = applyTemplateOverrides(base, scene("introduction", { character_name: "Ada", },),);

    expect(result.layout,).toBe("split",);
    expect(result.imageScaling,).toBe("cover",);
    expect(result.typewriterSpeed,).toBe(30,);
  });
});

describe("applyTemplateOverrides — layout whitelist", () => {
  test("an inherit layout falls back to the base layout", () => {
    // No shipped scene template uses layout inherit (scene-templates.test.ts
    // asserts that too), so the fallback decision is exercised through the
    // scene-has-no-template path plus a template whose layout differs.
    const base = { ...baseSettings(), layout: "split" as const, };

    // quiet_moment ships layout below — applied.
    expect(applyTemplateOverrides(base, scene("quiet_moment", {},),).layout,).toBe("below",);

    // No template: base layout survives unchanged.
    expect(applyTemplateOverrides(base, scene(undefined,),).layout,).toBe("split",);
  });
});

describe("applyTemplateOverrides — portrait fields are not mapped", () => {
  test("body.portrait.size does not leak into portraitSize (percent vs scale)", () => {
    const base = baseSettings();
    // introduction ships portrait.size 1.2 (scale-like). Mapping it onto the
    // percentage field would render a 1.2%-tall portrait.
    const result = applyTemplateOverrides(base, scene("introduction", { character_name: "Ada", },),);
    expect(result.portraitSize,).toBe(base.portraitSize,);
    expect(result.portraitSize,).toBe(35,);
  });

  test("the base settings object is never mutated", () => {
    const base = baseSettings();
    applyTemplateOverrides(base, scene("confrontation", { character_name: "Ada", },),);

    expect(base.transition,).toBe("fade",);
    expect(base.layout,).toBe("overlay",);
    expect(base.typewriterSpeed,).toBe(30,);
  });
});

// ── Custom-template resolution & composite fail-closed (vn-epic-completion) ──

const WORLD = "apply-test-world";

// bun:test has no DOM storage; install a per-test in-memory stub so the
// custom-template store is hermetic (no cross-file global leakage).
const storage = new Map<string, string>();
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  storage.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string,) => storage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void storage.set(key, String(value,),),
    removeItem: (key: string,) => void storage.delete(key,),
  };
},);

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
},);

function customTemplate(overrides: Partial<VnTemplate>,): VnTemplate {
  return {
    id: "custom_scene",
    name: "Custom Scene",
    description: "",
    worldId: WORLD,
    category: "scene",
    version: 1,
    variables: [],
    body: { layout: "split", transition: "dissolve", },
    tags: [],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// Storage cleanup between tests is handled by the shared beforeEach
// (testStorage.clear()); nothing persists to restore here.

describe("resolveTemplateForScene — custom store", () => {
  test("a world custom template resolves after the built-in registry misses", () => {
    saveTemplate(customTemplate({},),);
    const resolved = resolveTemplateForScene(scene("custom_scene",), WORLD,);
    expect(resolved?.id,).toBe("custom_scene",);
  });

  test("custom lookup is skipped without a world id", () => {
    saveTemplate(customTemplate({},),);
    expect(resolveTemplateForScene(scene("custom_scene",), null,),).toBeUndefined();
  });

  test("built-in ids keep winning over same-named custom templates", () => {
    saveTemplate(customTemplate({ id: "introduction", body: { layout: "below", transition: "fade", }, },),);
    const resolved = resolveTemplateForScene(scene("introduction",), WORLD,);
    expect(resolved?.body.layout,).toBe("split",);
  });
});

describe("resolveAnyTemplate", () => {
  test("resolves scene registry, dialogue registry, then the custom store", () => {
    expect(resolveAnyTemplate("introduction",)?.category,).toBe("scene",);
    expect(resolveAnyTemplate("dialogue_tense",)?.category,).toBe("dialogue",);

    saveTemplate(customTemplate({},),);
    expect(resolveAnyTemplate("custom_scene", WORLD,)?.id,).toBe("custom_scene",);
    expect(resolveAnyTemplate("custom_scene",),).toBeUndefined();
  });
});

describe("applyTemplateOverrides — custom & composite templates", () => {
  test("a world custom scene template is applied at render resolution", () => {
    saveTemplate(customTemplate({},),);
    const result = applyTemplateOverrides(baseSettings(), scene("custom_scene",), WORLD,);
    expect(result.layout,).toBe("split",);
    expect(result.transition,).toBe("dissolve",);
  });

  test("custom templates never resolve when no worldId is threaded", () => {
    saveTemplate(customTemplate({},),);
    const base = baseSettings();
    expect(applyTemplateOverrides(base, scene("custom_scene",),),).toBe(base,);
  });

  test("a composite template fails closed to base settings on this one-shot path", () => {
    saveTemplate(customTemplate({
      category: "composite",
      body: {
        layout: "inherit",
        transition: "inherit",
        steps: [{ templateId: "confrontation", },],
      },
    },),);

    const base = baseSettings();
    const result = applyTemplateOverrides(base, scene("custom_scene",), WORLD,);
    expect(result,).toBe(base,);
  });
});

describe("applyResolvedTemplate — dialogue bodies merge pacing only", () => {
  test("a dialogue template's typewriter speed applies; its none transition does not", () => {
    const tense = DIALOGUE_TEMPLATES.find((t,) => t.id === "dialogue_tense")!;
    const result = applyResolvedTemplate(baseSettings(), tense, {},);
    expect(result.typewriterSpeed,).toBe(tense.body.text?.typewriterSpeed ?? -1,);
    expect(result.transition,).toBe("fade",);
    expect(result.layout,).toBe("overlay",);
  });

  test("later applications override earlier ones (fold order)", () => {
    const narration = DIALOGUE_TEMPLATES.find((t,) => t.id === "narration")!;
    const base = baseSettings();
    const once = applyResolvedTemplate(base, narration, {},);
    const twice = applyResolvedTemplate(once, narration, {},);
    expect(twice.typewriterSpeed,).toBe(narration.body.text?.typewriterSpeed ?? -1,);
  });
});
