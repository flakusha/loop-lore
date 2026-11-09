// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import {
  actionDescription,
  actionLabel,
  findCatalogAction,
  findCatalogPosition,
  INTIMACY_ACTION_CATALOG,
  INTIMACY_POSITION_CATALOG,
  type IntimacyActionView,
  type IntimacyPositionOption,
  positionContext,
  positionDescription,
  positionLabel,
} from "./intimacy-types";

/** Fresh catalog-entry fixture (never the shared catalog object). */
function actionFixture(): IntimacyActionView {
  return {
    id: "talk",
    nameKey: "nsfw.intimacy.action.talk",
    descriptionKey: "nsfw.intimacy.actionDesc.talk",
    type: "verbal",
    delta: 2,
    minIntimacy: 0,
    requiresConsent: false,
  };
}

describe("actionLabel", () => {
  it("falls back to the name key when no locale catalog is loaded", () => {
    const action = actionFixture();
    expect(actionLabel(action,),).toBe(action.nameKey,);
  });

  it("resolves every catalog entry to a non-empty string", () => {
    for (const entry of INTIMACY_ACTION_CATALOG) {
      expect(actionLabel(entry,).length,).toBeGreaterThan(0,);
    }
  });
});

describe("actionDescription", () => {
  it("falls back to the description key when no locale catalog is loaded", () => {
    const action = actionFixture();
    expect(actionDescription(action,),).toBe(action.descriptionKey,);
  });

  it("resolves every catalog entry to a non-empty string", () => {
    for (const entry of INTIMACY_ACTION_CATALOG) {
      expect(actionDescription(entry,).length,).toBeGreaterThan(0,);
    }
  });
});

describe("findCatalogAction", () => {
  it("returns the entry for a known id", () => {
    expect(findCatalogAction("talk",)?.id,).toBe("talk",);
    expect(findCatalogAction("play",)?.requiresConsent,).toBe(true,);
  });

  it("returns null for an unknown id", () => {
    expect(findCatalogAction("nope",),).toBeNull();
  });
});

describe("INTIMACY_POSITION_CATALOG", () => {
  it("carries the three Phase-1 staging ids, each unique", () => {
    const ids = INTIMACY_POSITION_CATALOG.map((entry,) => entry.id);
    expect(ids,).toEqual(["side-by-side", "facing", "embrace-hold",],);
    expect(new Set(ids,).size,).toBe(ids.length,);
  });
});

describe("positionLabel / positionDescription", () => {
  it("resolves every catalog entry to a non-empty string", () => {
    for (const entry of INTIMACY_POSITION_CATALOG) {
      expect(positionLabel(entry,).length,).toBeGreaterThan(0,);
      expect(positionDescription(entry,).length,).toBeGreaterThan(0,);
    }
  });

  it("falls back to the keys when no locale catalog is loaded", () => {
    const entry: IntimacyPositionOption = {
      id: "facing",
      nameKey: "nsfw.intimacy.position.facing",
      descriptionKey: "nsfw.intimacy.positionDesc.facing",
    };

    expect(positionLabel(entry,),).toBe(entry.nameKey,);
    expect(positionDescription(entry,),).toBe(entry.descriptionKey,);
  });
});

describe("positionContext", () => {
  it("encodes the position id into the apply wire context", () => {
    const facing = findCatalogPosition("facing",)!;
    expect(positionContext(facing,),).toBe("near/facing:facing",);
  });

  it("returns undefined when no position is staged", () => {
    expect(positionContext(null,),).toBeUndefined();
  });
});
