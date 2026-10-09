// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Overlay renderer tests: emotion mapping, condition-icon detection, and the
 * status-bar / location / time HTML builders.
 *
 * Every builder is a pure string function whose contract is twofold: emit the
 * right markup for a realistic payload, and emit "" when there is nothing to
 * show (so templates can x-html them unconditionally). The builders interpolate
 * DB-derived strings (condition labels, location names, formatted stamps), so
 * each one also pins the escaping property: hostile input must not break out
 * of the double-quoted attribute or the text context it lands in.
 *
 * `applyEmotionFx` is the one DOM-touching export. No happy-dom here, so it
 * runs against a minimal fake element exposing classList — which is all
 * `applyFx` needs for the non-typewriter effects the emotion table maps to.
 */
import { describe, expect, it, } from "bun:test";
import {
  applyEmotionFx,
  conditionIconsHtml,
  detectConditionIcons,
  emotionFx,
  emotionFxClass,
  locationBadgeHtml,
  MAX_CONDITION_ICONS,
  statusBarHtml,
  timeBadgeHtml,
} from "./overlays";

/** Fake element with just enough DOM surface for applyFx's class toggling. */
function fakeEl(): { el: HTMLElement; classes: Set<string> } {
  const classes = new Set<string>();
  const el = {
    classList: {
      add: (...n: string[]) => {
        for (const c of n) {
          classes.add(c,);
        }
      },
      remove: (...n: string[]) => {
        for (const c of n) {
          classes.delete(c,);
        }
      },
      contains: (n: string,) => classes.has(n,),
    },
  } as unknown as HTMLElement;

  return { el, classes, };
}

const stats = { hp: 7, maxHp: 10, mp: 2, maxMp: 5, };

describe("emotionFx", () => {
  it("maps each shipped emotion to its core effect", () => {
    expect(emotionFx("angry",),).toBe("shake",);
    expect(emotionFx("happy",),).toBe("glow",);
    expect(emotionFx("sad",),).toBe("fade",);
  });

  it("lowercases the lookup so a non-canonical casing still maps", () => {
    expect(emotionFx("ANGRY",),).toBe("shake",);
    expect(emotionFx("Happy",),).toBe("glow",);
  });

  it("returns null for an emotion with no core equivalent", () => {
    // surprised/fearful/magic are real EmotionType values with no text-fx class.
    expect(emotionFx("surprised",),).toBeNull();
    expect(emotionFx("fearful",),).toBeNull();
    expect(emotionFx("magic",),).toBeNull();
  });

  it("returns null for unknown, empty and absent emotions", () => {
    expect(emotionFx("wat",),).toBeNull();
    expect(emotionFx("",),).toBeNull();
    expect(emotionFx(null,),).toBeNull();
    expect(emotionFx(undefined,),).toBeNull();
  });
});

describe("emotionFxClass", () => {
  it("prefixes the mapped effect with fx-", () => {
    expect(emotionFxClass("angry",),).toBe("fx-shake",);
    expect(emotionFxClass("happy",),).toBe("fx-glow",);
    expect(emotionFxClass("sad",),).toBe("fx-fade",);
  });

  it("returns an empty string when there is no effect", () => {
    expect(emotionFxClass("surprised",),).toBe("",);
    expect(emotionFxClass(null,),).toBe("",);
    expect(emotionFxClass(undefined,),).toBe("",);
  });
});

describe("applyEmotionFx", () => {
  it("applies the effect class and removes it on stop()", () => {
    const { el, classes, } = fakeEl();

    const stop = applyEmotionFx(el, "angry",);

    expect(classes.has("fx-shake",),).toBe(true,);
    stop();
    expect(classes.has("fx-shake",),).toBe(false,);
  });

  it("clears a prior fx class so a re-apply re-triggers the keyframe", () => {
    const { el, classes, } = fakeEl();
    applyEmotionFx(el, "angry",);

    applyEmotionFx(el, "happy",);

    expect(classes.has("fx-shake",),).toBe(false,);
    expect(classes.has("fx-glow",),).toBe(true,);
  });

  it("is a no-op for an unmapped emotion", () => {
    const { el, classes, } = fakeEl();

    const stop = applyEmotionFx(el, "surprised",);

    expect([...classes,],).toEqual([],);

    expect(() => {
      stop();
    },).not.toThrow();

    expect([...classes,],).toEqual([],);
  });
});

describe("MAX_CONDITION_ICONS", () => {
  it("is the spec cap of 3", () => {
    expect(MAX_CONDITION_ICONS,).toBe(3,);
  });

  it("caps detection at 3 icons even when more categories match", () => {
    // Matches Combat, Danger, Magic, Night, Fire and Romance — six categories.
    const content = "The battle turned dark and deadly; she cast a spell and kissed him while fire raged.";

    const icons = detectConditionIcons(content,);

    expect(icons.length,).toBe(MAX_CONDITION_ICONS,);
    expect(icons.map((i,) => i.label),).toEqual(["Combat", "Danger", "Magic",],);
  });
});

describe("detectConditionIcons", () => {
  it("matches on keywords anywhere in the content, case-insensitively", () => {
    expect(detectConditionIcons("The Dragon attacks!",).map((i,) => i.label),).toEqual(["Combat",],);
    expect(detectConditionIcons("A chill in the MOONLIT air",).map((i,) => i.label),).toEqual(["Night",],);
  });

  it("pairs every detection with its icon and label", () => {
    expect(detectConditionIcons("burning inferno",),).toEqual([{ icon: "🔥", label: "Fire", },],);
  });

  it("returns an empty list when nothing matches", () => {
    expect(detectConditionIcons("She smiled and said hello.",),).toEqual([],);
    expect(detectConditionIcons("",),).toEqual([],);
  });
});

describe("conditionIconsHtml", () => {
  it("renders one titled span per icon under an aria-labelled container", () => {
    const html = conditionIconsHtml("A sword fight begins.",);

    expect(html,).toContain(`class="fx-condition-icons"`,);
    expect(html,).toContain(`role="img"`,);
    expect(html,).toContain(`aria-label="Message context: Combat"`,);
    expect(html,).toContain(`class="fx-condition-icon" title="Combat"`,);
    expect(html.match(/class="fx-condition-icon"/g,)?.length,).toBe(1,);
  });

  it("renders an empty string when no condition is detected", () => {
    expect(conditionIconsHtml("Just a friendly chat.",),).toBe("",);
  });

  it("never echoes message content, so markup in the text cannot reach the DOM", () => {
    const html = conditionIconsHtml(`<script>alert(1)</script> combat`,);

    expect(html,).not.toContain("<script",);
    expect(html,).toContain(`title="Combat"`,);
  });
});

describe("statusBarHtml", () => {
  it("renders HP, a progressbar and MP", () => {
    const html = statusBarHtml(stats,);

    expect(html,).toContain(`role="status"`,);
    expect(html,).toContain(`❤️ 7/10`,);
    expect(html,).toContain(`🔷 2/5`,);
    expect(html,).toContain(`aria-valuemin="0" aria-valuemax="100"`,);
    expect(html,).toContain(`aria-valuenow="70"`,);
    expect(html,).toContain(`style="width:70%"`,);
  });

  it("returns an empty string when stats are absent (RPG inactive)", () => {
    expect(statusBarHtml(null,),).toBe("",);
    expect(statusBarHtml(undefined,),).toBe("",);
  });

  it("clamps the bar to 100% when hp exceeds the max", () => {
    expect(statusBarHtml({ ...stats, hp: 99, },),).toContain(`aria-valuenow="100"`,);
  });

  it("clamps negative and non-finite stats to zero", () => {
    const html = statusBarHtml({ hp: -5, maxHp: 0, mp: Number.NaN, maxMp: 10, },);

    expect(html,).toContain(`❤️ 0/0`,);
    expect(html,).toContain(`🔷 0/10`,);
    // maxHp of 0 would divide by zero; the bar reports empty instead.
    expect(html,).toContain(`aria-valuenow="0"`,);
    expect(html,).toContain(`style="width:0%"`,);
  });

  it("rounds the bar percentage", () => {
    expect(statusBarHtml({ ...stats, hp: 1, maxHp: 3, },),).toContain(`aria-valuenow="33"`,);
  });

  it("appends conditions and drops blank ones", () => {
    const html = statusBarHtml(stats, ["poisoned", "  ", " blessed ",],);

    expect(html,).toContain(`<span class="fx-status-cond">poisoned</span>`,);
    expect(html,).toContain(`<span class="fx-status-cond">blessed</span>`,);
    expect(html.match(/class="fx-status-cond"/g,)?.length,).toBe(2,);
    expect(html,).toContain(`aria-label="HP 7 of 10, MP 2 of 5, poisoned, blessed"`,);
  });

  it("escapes condition labels so they cannot break out of the attribute", () => {
    const html = statusBarHtml(stats, [`" onmouseover="alert(1)`,],);

    expect(html,).not.toContain(`onmouseover="alert(1)"`,);
    expect(html,).toContain(`&quot; onmouseover=&quot;alert(1)`,);
  });
});

describe("locationBadgeHtml", () => {
  it("renders a pinned badge carrying the label in title and aria-label", () => {
    expect(locationBadgeHtml("The Drowned Marsh",),).toBe(
      `<span class="fx-location-badge" title="The Drowned Marsh" aria-label="Location: The Drowned Marsh">📍 The Drowned Marsh</span>`,
    );
  });

  it("returns an empty string when there is no label", () => {
    expect(locationBadgeHtml("",),).toBe("",);
    expect(locationBadgeHtml(null,),).toBe("",);
    expect(locationBadgeHtml(undefined,),).toBe("",);
  });

  it("escapes a hostile label in both the attribute and the text context", () => {
    const html = locationBadgeHtml(`Marsh"><script>alert(1)</script>`,);

    expect(html,).not.toContain("<script",);
    expect(html,).not.toContain(`"><`,);
    expect(html,).toContain(`Marsh&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;`,);
  });
});

describe("timeBadgeHtml", () => {
  it("renders a <time> element with the formatted stamp", () => {
    expect(timeBadgeHtml("14:32",),).toBe(`<time class="fx-time-badge">14:32</time>`,);
  });

  it("adds the datetime attribute when a machine-readable stamp is given", () => {
    expect(timeBadgeHtml("14:32", "2026-10-09T14:32:00Z",),).toBe(
      `<time class="fx-time-badge" datetime="2026-10-09T14:32:00Z">14:32</time>`,
    );
  });

  it("returns an empty string when there is no label", () => {
    expect(timeBadgeHtml("",),).toBe("",);
    expect(timeBadgeHtml(null,),).toBe("",);
    expect(timeBadgeHtml(undefined,),).toBe("",);
  });

  it("escapes both the label and the datetime attribute", () => {
    const html = timeBadgeHtml(`12:00" onclick="steal()`, `a"><script>alert(1)</script>`,);

    expect(html,).not.toContain("<script",);
    expect(html,).toContain(`12:00&quot; onclick=&quot;steal(`,);
    expect(html,).toContain(`datetime="a&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"`,);
  });
});
