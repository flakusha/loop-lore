// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import {
  actionDescription,
  actionLabel,
  findCatalogAction,
  INTIMACY_ACTION_CATALOG,
  type IntimacyActionView,
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
